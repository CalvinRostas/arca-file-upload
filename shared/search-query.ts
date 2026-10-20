// The search query language, shared by the server (to build SQL) and the app (to draw chips).
//
//   kyoto tag:travel tag:"two words" type:image in:/Photos/2024 after:2023 before:2025-06
//
// Free words match names (typo-tolerant); every filter narrows further (AND). Several `type:`
// filters widen each other (OR), since one File has only one type.

export const SEARCH_TYPES = ['image', 'video', 'audio', 'pdf', 'document', 'archive', 'text', 'folder', 'file'] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

const TYPE_ALIASES: Record<string, SearchType> = {
  image: 'image',
  images: 'image',
  photo: 'image',
  photos: 'image',
  picture: 'image',
  pictures: 'image',
  video: 'video',
  videos: 'video',
  movie: 'video',
  movies: 'video',
  audio: 'audio',
  music: 'audio',
  sound: 'audio',
  pdf: 'pdf',
  pdfs: 'pdf',
  document: 'document',
  documents: 'document',
  doc: 'document',
  docs: 'document',
  archive: 'archive',
  archives: 'archive',
  zip: 'archive',
  text: 'text',
  code: 'text',
  folder: 'folder',
  folders: 'folder',
  dir: 'folder',
  file: 'file',
  files: 'file',
}

export interface SearchQuery {
  /** Free words, matched against names. */
  words: string[]
  tags: string[]
  types: SearchType[]
  /** Folder path from the root, like `Photos/2024`. */
  in: string | null
  /** Inclusive lower / exclusive upper bound on when Items were added, as written (YYYY[-MM[-DD]]). */
  after: string | null
  before: string | null
  /** Parts of the query that couldn't be understood, phrased for people. */
  problems: string[]
}

const TOKEN = /(\w+):"([^"]*)"?|(\w+):(\S+)|"([^"]*)"?|(\S+)/g
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

export function emptyQuery(): SearchQuery {
  return { words: [], tags: [], types: [], in: null, after: null, before: null, problems: [] }
}

export function parseQuery(input: string): SearchQuery {
  const query = emptyQuery()
  for (const match of input.matchAll(TOKEN)) {
    const [, quotedKey, quotedValue, key, value, quotedWord, word] = match
    const k = (quotedKey ?? key)?.toLowerCase()
    const v = (quotedValue ?? value ?? '').trim()

    if (k === undefined) {
      const text = (quotedWord ?? word ?? '').trim()
      if (text) query.words.push(text)
      continue
    }
    switch (k) {
      case 'tag':
        if (v && !query.tags.some((t) => t.toLowerCase() === v.toLowerCase())) query.tags.push(v)
        break
      case 'type': {
        const type = TYPE_ALIASES[v.toLowerCase()]
        if (!type) query.problems.push(`“${v}” isn’t a type. Try ${SEARCH_TYPES.join(', ')}.`)
        else if (!query.types.includes(type)) query.types.push(type)
        break
      }
      case 'in':
        query.in = v.replace(/^\/+|\/+$/g, '') || null
        break
      case 'after':
      case 'before':
        if (!DATE.test(v)) query.problems.push(`“${v}” isn’t a date. Use 2024, 2024-06 or 2024-06-30.`)
        else query[k] = v
        break
      default:
        // Not a filter we know (e.g. a name with a colon): treat it as words.
        query.words.push(match[0].replace(/"/g, ''))
    }
  }
  return query
}

const quote = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value)

/** The canonical text for a query: words first, then filters. `parseQuery(formatQuery(q))` ≈ `q`. */
export function formatQuery(query: SearchQuery): string {
  return [
    ...query.words.map(quote),
    ...query.tags.map((t) => `tag:${quote(t)}`),
    ...query.types.map((t) => `type:${t}`),
    ...(query.in ? [`in:${quote(`/${query.in}`)}`] : []),
    ...(query.after ? [`after:${query.after}`] : []),
    ...(query.before ? [`before:${query.before}`] : []),
  ].join(' ')
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return (
    query.words.length === 0 &&
    query.tags.length === 0 &&
    query.types.length === 0 &&
    !query.in &&
    !query.after &&
    !query.before
  )
}

/**
 * `after:2024` means after 2024 ended; `before:2024-06` means before June began.
 * Returns the instant the bound refers to (UTC).
 */
export function dateBound(value: string, side: 'after' | 'before'): Date {
  const [, y, m, d] = DATE.exec(value)!
  const year = Number(y)
  const month = m ? Number(m) - 1 : 0
  const day = d ? Number(d) : 1
  if (side === 'before') return new Date(Date.UTC(year, month, day))
  if (d) return new Date(Date.UTC(year, month, day + 1))
  if (m) return new Date(Date.UTC(year, month + 1, 1))
  return new Date(Date.UTC(year + 1, 0, 1))
}
