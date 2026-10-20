import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { schema, type Db } from '../../db'
import { InvalidInput, InvalidMove, NameConflict, NotFound } from '../errors'
import { cleanName, freeName } from './names'

const { item, blob } = schema

/** What to do when a File's name is already taken in its Folder (see GLOSSARY: Name collision). */
export type ConflictChoice = 'replace' | 'keepBoth' | 'skip'

export interface Item {
  id: string
  kind: 'folder' | 'file'
  name: string
  parentId: string | null
  /** Files only. */
  size: number | null
  mimeType: string | null
  /** Folders only: how many non-trashed Items are directly inside. */
  childCount: number | null
  /** Files only: a thumbnail is ready (see Previews). */
  thumbnail: boolean
  /** Folders only: up to three Files directly inside with thumbnails, newest first (the folder mosaic). */
  mosaic: string[] | null
  /** Files only: ids of the Owner's Tags on this File. */
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export interface Crumb {
  id: string
  name: string
}

export interface Listing {
  /** null for the Owner's root. */
  folder: Crumb | null
  /** From the top-level Folder down to (and including) `folder`. Empty at the root. */
  path: Crumb[]
  /** Folders first, then Files, each by name. */
  items: Item[]
}

/** Everything Ingest needs to add a finished Upload. */
export interface NewFile {
  name: string
  blob: { hash: string; size: number }
  mimeType: string | null
}

export type AddFileResult =
  | {
      status: 'added'
      file: Item
      /** True when a same-named File was moved to Trash to make room. */
      replaced: boolean
      /** Another of this Owner's Files with identical bytes, if any (a Duplicate). */
      duplicateOf: { id: string; name: string; path: Crumb[] } | null
    }
  | { status: 'skipped' }

/** One entry of a subtree walk, e.g. for a zip download. Paths use `/` and start at the walked Item. */
export interface WalkEntry {
  path: string
  kind: 'folder' | 'file'
  blobHash: string | null
  size: number | null
  updatedAt: Date
}

export interface StoredFile {
  id: string
  name: string
  size: number
  mimeType: string | null
  blobHash: string
}

export type Library = ReturnType<typeof createLibrary>
export type OwnerLibrary = ReturnType<Library['for']>

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

/**
 * The Folder tree, Files, and the rules that keep them consistent. All access goes through
 * an Owner-scoped handle (ADR-0005); other Owners' Items are indistinguishable from missing ones.
 */
export function createLibrary({ db }: { db: Db }) {
  return {
    for(owner: { id: string }) {
      return scoped(db, owner.id)
    },
  }
}

function scoped(db: Db, ownerId: string) {
  const mine = (...conditions: (SQL | undefined)[]) =>
    and(eq(item.ownerId, ownerId), isNull(item.trashedAt), ...conditions)
  const inFolder = (parentId: string | null) =>
    parentId === null ? isNull(item.parentId) : eq(item.parentId, parentId)

  async function requireFolder(q: Executor, folderId: string | null): Promise<Crumb | null> {
    if (folderId === null) return null
    const [row] = await q
      .select({ id: item.id, name: item.name })
      .from(item)
      .where(mine(eq(item.id, folderId), eq(item.kind, 'folder')))
    if (!row) throw new NotFound('Folder not found')
    return row
  }

  async function requireItem(q: Executor, itemId: string) {
    const [row] = await q
      .select()
      .from(item)
      .where(mine(eq(item.id, itemId)))
    if (!row) throw new NotFound('Item not found')
    return row
  }

  /** Path from the top down to `folderId` (inclusive). */
  async function pathTo(q: Executor, folderId: string | null): Promise<Crumb[]> {
    if (folderId === null) return []
    const result = await q.execute<{ id: string; name: string }>(sql`
      with recursive chain as (
        select id, parent_id, name, 0 as depth from item where id = ${folderId} and owner_id = ${ownerId}
        union all
        select i.id, i.parent_id, i.name, chain.depth + 1 from item i join chain on i.id = chain.parent_id
      )
      select id, name from chain order by depth desc`)
    return result.rows.map((r) => ({ id: r.id, name: r.name }))
  }

  /** Serialize writes into one Folder so name checks and inserts can't interleave. */
  async function lockFolder(tx: Tx, parentId: string | null) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${ownerId}:${parentId ?? ''}`}))`)
  }

  async function siblingNames(q: Executor, parentId: string | null): Promise<Set<string>> {
    const rows = await q
      .select({ name: item.name })
      .from(item)
      .where(mine(inFolder(parentId)))
    return new Set(rows.map((r) => r.name.toLowerCase()))
  }

  async function findSibling(q: Executor, parentId: string | null, name: string) {
    const [row] = await q
      .select()
      .from(item)
      .where(mine(inFolder(parentId), sql`lower(${item.name}) = lower(${name})`))
    return row
  }

  async function insertFolder(q: Executor, parentId: string | null, name: string) {
    const [row] = await q.insert(item).values({ id: randomUUID(), ownerId, parentId, kind: 'folder', name }).returning()
    return toItem(row!, 0)
  }

  /** Items with everything a tile needs: child counts, thumbnail flags, mosaics, tags. */
  async function decorated(where: SQL | undefined) {
    const rows = await db
      .select({
        row: item,
        childCount: sql<number>`(
          select count(*)::int from item c
          where c.parent_id = "item"."id" and c.trashed_at is null
        )`,
        thumbnail: sql<boolean>`exists(
          select 1 from preview p where p.blob_hash = "item"."blob_hash" and p.status = 'ready'
        )`,
        tags: sql<string[]>`array(select it.tag_id from item_tag it where it.item_id = "item"."id")`,
        mosaic: sql<string[] | null>`case when "item"."kind" = 'folder' then array(
          select c.id from item c join preview p on p.blob_hash = c.blob_hash and p.status = 'ready'
          where c.parent_id = "item"."id" and c.trashed_at is null
          order by c.created_at desc limit 3
        ) end`,
      })
      .from(item)
      .where(where)
      .orderBy(desc(item.kind), asc(sql`lower(${item.name})`))
    return rows.map((r) => toItem(r.row, r.childCount, r.thumbnail, r.mosaic, r.tags))
  }

  return {
    async list(folderId: string | null): Promise<Listing> {
      const folder = await requireFolder(db, folderId)
      const [path, items] = await Promise.all([pathTo(db, folderId), decorated(mine(inFolder(folderId)))])
      return { folder, path, items }
    },

    /**
     * Full Items for the given ids, in the given order, each with the path of the Folder it
     * sits in. Ids that aren't the Owner's (or are trashed) are left out. For search results.
     */
    async describe(itemIds: string[]): Promise<(Item & { path: Crumb[] })[]> {
      if (itemIds.length === 0) return []
      const items = await decorated(mine(inArray(item.id, itemIds)))
      const parents = [...new Set(items.map((i) => i.parentId).filter((id): id is string => id !== null))]
      const paths = new Map(await Promise.all(parents.map(async (id) => [id, await pathTo(db, id)] as const)))
      const byId = new Map(items.map((i) => [i.id, { ...i, path: i.parentId ? (paths.get(i.parentId) ?? []) : [] }]))
      return itemIds.flatMap((id) => byId.get(id) ?? [])
    },

    async createFolder(parentId: string | null, rawName: string): Promise<Item> {
      const name = cleanName(rawName)
      return db.transaction(async (tx) => {
        await requireFolder(tx, parentId)
        await lockFolder(tx, parentId)
        if (await findSibling(tx, parentId, name)) throw new NameConflict(name)
        return insertFolder(tx, parentId, name)
      })
    },

    /**
     * Walk (and create where missing) `segments` below `parentId`, reusing Folders that already
     * exist. Used for folder Uploads. Returns the deepest Folder's id.
     */
    async ensureFolderPath(parentId: string | null, segments: string[]): Promise<string | null> {
      const names = segments.map(cleanName)
      return db.transaction(async (tx) => {
        await requireFolder(tx, parentId)
        let current = parentId
        for (const name of names) {
          await lockFolder(tx, current)
          const existing = await findSibling(tx, current, name)
          if (existing?.kind === 'folder') {
            current = existing.id
            continue
          }
          const finalName = existing ? freeName(name, await siblingNames(tx, current)) : name
          current = (await insertFolder(tx, current, finalName)).id
        }
        return current
      })
    },

    /** Which of `names` are already taken in the Folder (for the pre-upload collision prompt). */
    async takenNames(folderId: string | null, names: string[]): Promise<string[]> {
      await requireFolder(db, folderId)
      const taken = await siblingNames(db, folderId)
      return names.filter((n) => taken.has(n.normalize('NFC').trim().toLowerCase()))
    },

    async addFile(parentId: string | null, file: NewFile, onConflict: ConflictChoice): Promise<AddFileResult> {
      const name = cleanName(file.name)
      return db.transaction(async (tx) => {
        await requireFolder(tx, parentId)
        await lockFolder(tx, parentId)
        await tx.insert(blob).values({ hash: file.blob.hash, size: file.blob.size }).onConflictDoNothing()

        let finalName = name
        let replaced = false
        const existing = await findSibling(tx, parentId, name)
        if (existing) {
          if (onConflict === 'skip') return { status: 'skipped' as const }
          if (onConflict === 'replace' && existing.kind === 'file') {
            await tx.update(item).set({ trashedAt: new Date() }).where(eq(item.id, existing.id))
            replaced = true
          } else {
            finalName = freeName(name, await siblingNames(tx, parentId))
          }
        }

        const [twin] = await tx
          .select({ id: item.id, name: item.name, parentId: item.parentId })
          .from(item)
          .where(mine(eq(item.kind, 'file'), eq(item.blobHash, file.blob.hash)))
          .limit(1)

        const [row] = await tx
          .insert(item)
          .values({
            id: randomUUID(),
            ownerId,
            parentId,
            kind: 'file',
            name: finalName,
            blobHash: file.blob.hash,
            size: file.blob.size,
            mimeType: file.mimeType,
          })
          .returning()

        return {
          status: 'added' as const,
          file: toItem(row!, null),
          replaced,
          duplicateOf: twin ? { id: twin.id, name: twin.name, path: await pathTo(tx, twin.parentId) } : null,
        }
      })
    },

    async rename(itemId: string, rawName: string): Promise<Item> {
      const name = cleanName(rawName)
      return db.transaction(async (tx) => {
        const current = await requireItem(tx, itemId)
        await lockFolder(tx, current.parentId)
        const clash = await findSibling(tx, current.parentId, name)
        if (clash && clash.id !== itemId) throw new NameConflict(name)
        const [row] = await tx.update(item).set({ name }).where(eq(item.id, itemId)).returning()
        return toItem(row!, null)
      })
    },

    /** Move Items into `targetId` (null = root). Fails as a whole on any clash. */
    async move(itemIds: string[], targetId: string | null): Promise<void> {
      if (itemIds.length === 0) return
      await db.transaction(async (tx) => {
        await requireFolder(tx, targetId)
        const targetPath = new Set((await pathTo(tx, targetId)).map((c) => c.id))
        await lockFolder(tx, targetId)
        const rows = await tx
          .select()
          .from(item)
          .where(mine(inArray(item.id, itemIds)))
        if (rows.length !== new Set(itemIds).size) throw new NotFound('Item not found')

        const incoming = new Set<string>()
        for (const row of rows) {
          if (row.parentId === targetId) continue
          if (row.kind === 'folder' && targetPath.has(row.id)) {
            throw new InvalidMove(`“${row.name}” can’t be moved into itself`)
          }
          const key = row.name.toLowerCase()
          if (incoming.has(key) || (await findSibling(tx, targetId, row.name))) throw new NameConflict(row.name)
          incoming.add(key)
        }
        await tx
          .update(item)
          .set({ parentId: targetId })
          .where(mine(inArray(item.id, itemIds)))
      })
    },

    /**
     * Everything at and below `itemIds` (Files and Folders, not trashed), with paths relative
     * to their common parent. For zip downloads.
     */
    async walk(itemIds: string[]): Promise<WalkEntry[]> {
      const unique = [...new Set(itemIds)]
      if (unique.length === 0) return []
      const result = await db.execute<{
        path: string
        kind: 'folder' | 'file'
        blob_hash: string | null
        size: string | number | null
        updated_at: string | Date
        depth: number
      }>(sql`
        with recursive tree as (
          select id, kind, name::text as path, blob_hash, size, updated_at, 0 as depth
          from item
          where id in (${sql.join(
            unique.map((id) => sql`${id}`),
            sql`, `,
          )})
            and owner_id = ${ownerId} and trashed_at is null
          union all
          select c.id, c.kind, tree.path || '/' || c.name, c.blob_hash, c.size, c.updated_at, tree.depth + 1
          from item c join tree on c.parent_id = tree.id
          where c.trashed_at is null
        )
        select path, kind, blob_hash, size, updated_at, depth from tree order by depth, path`)
      const roots = result.rows.filter((r) => r.depth === 0).length
      if (roots !== unique.length) throw new NotFound('Item not found')
      return result.rows.map((r) => ({
        path: r.path,
        kind: r.kind,
        blobHash: r.blob_hash,
        size: r.size === null ? null : Number(r.size),
        updatedAt: new Date(r.updated_at),
      }))
    },

    async getFile(fileId: string): Promise<StoredFile> {
      const [row] = await db
        .select()
        .from(item)
        .where(mine(eq(item.id, fileId), eq(item.kind, 'file')))
      if (!row) throw new NotFound('File not found')
      return { id: row.id, name: row.name, size: row.size!, mimeType: row.mimeType, blobHash: row.blobHash! }
    },

    /** "Discard this copy": only allowed while another of the Owner's Files keeps the same bytes. */
    async discardDuplicate(fileId: string): Promise<void> {
      await db.transaction(async (tx) => {
        const file = await requireItem(tx, fileId)
        if (file.kind !== 'file') throw new NotFound('File not found')
        const [twin] = await tx
          .select({ id: item.id })
          .from(item)
          .where(mine(eq(item.blobHash, file.blobHash!), ne(item.id, fileId)))
          .limit(1)
        if (!twin) throw new InvalidInput('This is your only copy of this file, so it can’t be discarded')
        await tx.delete(item).where(eq(item.id, fileId))
      })
    },
  }
}

function toItem(
  row: typeof item.$inferSelect,
  childCount: number | null,
  thumbnail = false,
  mosaic: string[] | null = null,
  tags: string[] = [],
): Item {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    parentId: row.parentId,
    size: row.size,
    mimeType: row.mimeType,
    childCount: row.kind === 'folder' ? childCount : null,
    thumbnail: row.kind === 'file' && thumbnail,
    mosaic: row.kind === 'folder' ? (mosaic ?? []) : null,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
