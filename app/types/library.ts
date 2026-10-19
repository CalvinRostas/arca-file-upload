// Client-side shapes of the Library API (dates arrive as ISO strings).

export interface LibraryItem {
  id: string
  kind: 'folder' | 'file'
  name: string
  parentId: string | null
  size: number | null
  mimeType: string | null
  childCount: number | null
  createdAt: string
  updatedAt: string
}

export interface Crumb {
  id: string
  name: string
}

export interface Listing {
  folder: Crumb | null
  path: Crumb[]
  items: LibraryItem[]
}

export type ConflictChoice = 'replace' | 'keepBoth' | 'skip'

export type IngestResult =
  | {
      status: 'added'
      file: LibraryItem
      replaced: boolean
      duplicateOf: { id: string; name: string; path: Crumb[] } | null
    }
  | { status: 'skipped' }
