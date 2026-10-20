import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { schema, type Db } from '../../db'
import { TAG_COLORS, type TagColor } from '../../db/schema'
import { InvalidInput, NotFound, TagNameTaken } from '../errors'

const { tag, itemTag, item } = schema

export { TAG_COLORS, type TagColor }

export interface Tag {
  id: string
  name: string
  color: TagColor
  /** Non-trashed Files carrying this Tag. */
  fileCount: number
}

const MAX_TAG_LENGTH = 40

function cleanTagName(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!name) throw new InvalidInput('Tag names can’t be empty')
  if (name.length > MAX_TAG_LENGTH) throw new InvalidInput(`Tag names can be at most ${MAX_TAG_LENGTH} characters`)
  if (name.includes('"')) throw new InvalidInput('Tag names can’t contain quotes')
  return name
}

function checkColor(color: string): TagColor {
  if (!(TAG_COLORS as readonly string[]).includes(color)) throw new InvalidInput('Unknown tag colour')
  return color as TagColor
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/** Flat, coloured, per-Owner Tags on Files (GLOSSARY: Tag). Owner-scoped like the Library. */
export function createTags({ db }: { db: Db }) {
  return {
    for(owner: { id: string }) {
      const ownerId = owner.id
      const mine = (...conditions: Parameters<typeof and>) => and(eq(tag.ownerId, ownerId), ...conditions)

      async function requireTags(tagIds: string[]) {
        if (tagIds.length === 0) return
        const rows = await db
          .select({ id: tag.id })
          .from(tag)
          .where(mine(inArray(tag.id, tagIds)))
        if (rows.length !== new Set(tagIds).size) throw new NotFound('Tag not found')
      }

      return {
        async list(): Promise<Tag[]> {
          const rows = await db
            .select({
              id: tag.id,
              name: tag.name,
              color: tag.color,
              fileCount: sql<number>`(
                select count(*)::int from item_tag it join item i on i.id = it.item_id
                where it.tag_id = "tag"."id" and i.trashed_at is null
              )`,
            })
            .from(tag)
            .where(mine())
            .orderBy(asc(sql`lower(${tag.name})`))
          return rows
        },

        async create(rawName: string, color: string): Promise<Tag> {
          const name = cleanTagName(rawName)
          try {
            const [row] = await db
              .insert(tag)
              .values({ id: randomUUID(), ownerId, name, color: checkColor(color) })
              .returning()
            return { id: row!.id, name: row!.name, color: row!.color, fileCount: 0 }
          } catch (error) {
            if (isUniqueViolation(error)) throw new TagNameTaken(name)
            throw error
          }
        },

        async update(tagId: string, changes: { name?: string; color?: string }): Promise<void> {
          const values: Partial<typeof tag.$inferInsert> = {}
          if (changes.name !== undefined) values.name = cleanTagName(changes.name)
          if (changes.color !== undefined) values.color = checkColor(changes.color)
          try {
            const updated = await db
              .update(tag)
              .set(values)
              .where(mine(eq(tag.id, tagId)))
              .returning({ id: tag.id })
            if (updated.length === 0) throw new NotFound('Tag not found')
          } catch (error) {
            if (isUniqueViolation(error)) throw new TagNameTaken(values.name!)
            throw error
          }
        },

        /** Deleting a Tag removes it from every File; the Files themselves are untouched. */
        async remove(tagId: string): Promise<void> {
          const deleted = await db
            .delete(tag)
            .where(mine(eq(tag.id, tagId)))
            .returning({ id: tag.id })
          if (deleted.length === 0) throw new NotFound('Tag not found')
        },

        /** Add and/or remove Tags on several Files at once. Only Files can be tagged. */
        async apply(fileIds: string[], changes: { add?: string[]; remove?: string[] }): Promise<void> {
          const files = [...new Set(fileIds)]
          const add = [...new Set(changes.add ?? [])]
          const remove = [...new Set(changes.remove ?? [])]
          if (files.length === 0) return
          await requireTags([...add, ...remove])
          const owned = await db
            .select({ id: item.id })
            .from(item)
            .where(
              and(eq(item.ownerId, ownerId), isNull(item.trashedAt), eq(item.kind, 'file'), inArray(item.id, files)),
            )
          if (owned.length !== files.length) throw new NotFound('File not found')

          await db.transaction(async (tx) => {
            if (remove.length > 0) {
              await tx.delete(itemTag).where(and(inArray(itemTag.itemId, files), inArray(itemTag.tagId, remove)))
            }
            if (add.length > 0) {
              await tx
                .insert(itemTag)
                .values(files.flatMap((itemId) => add.map((tagId) => ({ itemId, tagId }))))
                .onConflictDoNothing()
            }
          })
        },
      }
    },
  }
}

export type Tags = ReturnType<typeof createTags>
