import { and, eq, sql, type SQL } from 'drizzle-orm'
import { dateBound, isEmptyQuery, parseQuery, type SearchQuery, type SearchType } from '../../../shared/search-query'
import { schema, type Db } from '../../db'
import { NotFound } from '../errors'
import type { Crumb, Item, Library } from '../library'

const { item, tag } = schema

export type SearchResult = Item & { path: Crumb[] }

export interface SearchResponse {
  query: SearchQuery
  results: SearchResult[]
  /** Why the query matched less than it might have (unknown tag, bad date, …), for people. */
  problems: string[]
}

/** Measured on real typos: 0.5 keeps "recipt"→receipt, "invoce"→invoice, drops "beach"→lake-bled. */
const TYPO_THRESHOLD = 0.5
/** Shorter words only match as substrings; trigram scores are noise at that length. */
const MIN_FUZZY_LENGTH = 4
const DEFAULT_LIMIT = 200

const ext = (...extensions: string[]) => sql`lower(${item.name}) ~ ${`\\.(${extensions.join('|')})$`}`
const mime = (pattern: string) => sql`coalesce(${item.mimeType}, '') like ${pattern}`

const TYPE_CONDITIONS: Record<Exclude<SearchType, 'folder' | 'file'>, SQL> = {
  image: sql`(${mime('image/%')} or ${ext('jpe?g', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'tiff?', 'svg', 'raw', 'dng', 'cr2', 'nef', 'arw')})`,
  video: sql`(${mime('video/%')} or ${ext('mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm')})`,
  audio: sql`(${mime('audio/%')} or ${ext('mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac', 'opus')})`,
  pdf: sql`(${mime('application/pdf')} or ${ext('pdf')})`,
  document: sql`(${mime('application/pdf')} or ${ext('pdf', 'docx?', 'odt', 'rtf', 'xlsx?', 'ods', 'csv', 'pptx?', 'odp', 'pages', 'numbers', 'key', 'md', 'txt')})`,
  archive: ext('zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'),
  text: sql`(${mime('text/%')} or ${ext('txt', 'md', 'csv', 'log', 'json', 'ya?ml', 'toml', 'xml', 'ini', 'conf')})`,
}

const likeEscape = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Search one Owner's Library with the query language in `shared/search-query.ts`.
 * The whole interface is one string in, ranked Items out.
 */
export function createSearch({ db, library }: { db: Db; library: Library }) {
  return {
    for(owner: { id: string }) {
      const ownerId = owner.id

      /** Folder id for a path like `Photos/2024`, matched by name from the root, ignoring case. */
      async function resolvePath(path: string): Promise<string | null> {
        let parent: string | null = null
        for (const segment of path.split('/').filter(Boolean)) {
          const rows: { id: string }[] = await db
            .select({ id: item.id })
            .from(item)
            .where(
              and(
                eq(item.ownerId, ownerId),
                sql`${item.trashedAt} is null`,
                eq(item.kind, 'folder'),
                parent === null ? sql`${item.parentId} is null` : eq(item.parentId, parent),
                sql`lower(${item.name}) = lower(${segment})`,
              ),
            )
          if (!rows[0]) return null
          parent = rows[0].id
        }
        return parent
      }

      const below = (folderId: string) => sql`${item.id} in (
        with recursive sub as (
          select id from item where parent_id = ${folderId} and trashed_at is null
          union all
          select c.id from item c join sub on c.parent_id = sub.id where c.trashed_at is null
        ) select id from sub)`

      return {
        async search(text: string, options: { within?: string | null; limit?: number } = {}): Promise<SearchResponse> {
          const query = parseQuery(text)
          const problems = [...query.problems]
          const nothing = () => ({ query, results: [], problems })
          if (isEmptyQuery(query) && !options.within) return nothing()

          const conditions: SQL[] = [eq(item.ownerId, ownerId), sql`${item.trashedAt} is null`]

          if (options.within) {
            const [folder] = await db
              .select({ id: item.id })
              .from(item)
              .where(and(eq(item.ownerId, ownerId), eq(item.id, options.within), eq(item.kind, 'folder')))
            if (!folder) throw new NotFound('Folder not found')
            conditions.push(below(folder.id))
          }
          if (query.in) {
            const folderId = await resolvePath(query.in)
            if (!folderId) {
              problems.push(`There’s no folder at “/${query.in}”.`)
              return nothing()
            }
            conditions.push(below(folderId))
          }

          for (const name of query.tags) {
            const [found] = await db
              .select({ id: tag.id })
              .from(tag)
              .where(and(eq(tag.ownerId, ownerId), sql`lower(${tag.name}) = lower(${name})`))
            if (!found) {
              problems.push(`You don’t have a tag called “${name}”.`)
              return nothing()
            }
            conditions.push(
              sql`exists(select 1 from item_tag it where it.item_id = ${item.id} and it.tag_id = ${found.id})`,
            )
          }

          const fileTypes = query.types.filter((t): t is keyof typeof TYPE_CONDITIONS => t !== 'folder' && t !== 'file')
          const kinds: SQL[] = fileTypes.map((t) => sql`(${item.kind} = 'file' and ${TYPE_CONDITIONS[t]})`)
          if (query.types.includes('folder')) kinds.push(sql`${item.kind} = 'folder'`)
          if (query.types.includes('file')) kinds.push(sql`${item.kind} = 'file'`)
          if (query.tags.length > 0 && kinds.length === 0) kinds.push(sql`${item.kind} = 'file'`)
          if (kinds.length > 0) conditions.push(sql`(${sql.join(kinds, sql` or `)})`)

          if (query.after) {
            conditions.push(sql`${item.createdAt} >= ${dateBound(query.after, 'after').toISOString()}::timestamptz`)
          }
          if (query.before) {
            conditions.push(sql`${item.createdAt} < ${dateBound(query.before, 'before').toISOString()}::timestamptz`)
          }

          const scores: SQL[] = []
          for (const word of query.words) {
            const contains = sql`lower(${item.name}) like ${`%${likeEscape(word.toLowerCase())}%`} escape '\\'`
            if (word.length < MIN_FUZZY_LENGTH) {
              conditions.push(contains)
              scores.push(sql`1`)
            } else {
              const similarity = sql`word_similarity(lower(${word}), lower(${item.name}))`
              conditions.push(sql`(${contains} or ${similarity} >= ${TYPO_THRESHOLD})`)
              scores.push(sql`(case when ${contains} then 1 else ${similarity} end)`)
            }
          }
          const exactName = query.words.join(' ').toLowerCase()
          // Best name match first; with only filters, newest first.
          const order: SQL[] = [sql`${item.createdAt} desc`]
          if (scores.length > 0) {
            order.unshift(
              sql`(${sql.join(scores, sql` + `)}) + (case when lower(${item.name}) = ${exactName} then 2 else 0 end) desc`,
            )
          }

          const rows = await db
            .select({ id: item.id })
            .from(item)
            .where(and(...conditions))
            .orderBy(...order)
            .limit(options.limit ?? DEFAULT_LIMIT)

          return { query, results: await library.for(owner).describe(rows.map((r) => r.id)), problems }
        },
      }
    },
  }
}

export type Search = ReturnType<typeof createSearch>
