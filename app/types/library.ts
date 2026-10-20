// Client-side shapes of the Library API (dates arrive as ISO strings).

export interface LibraryItem {
  id: string
  kind: 'folder' | 'file'
  name: string
  parentId: string | null
  size: number | null
  mimeType: string | null
  childCount: number | null
  /** Files: a thumbnail is ready at /api/files/:id/thumbnail. */
  thumbnail: boolean
  /** Folders: up to three File ids with thumbnails, for the folder mosaic. */
  mosaic: string[] | null
  /** Files: ids of the Owner's Tags on it. */
  tags: string[]
  /** It has a Share link. */
  shared: boolean
  /** Search results only: the Folder path the Item sits in. */
  path?: Crumb[]
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

export type SortOrder = 'name' | 'newest' | 'largest'
export type ViewMode = 'grid' | 'list'

export const TAG_COLORS = ['sage', 'lake', 'plum', 'rose', 'ochre', 'clay', 'slate', 'moss'] as const
export type TagColor = (typeof TAG_COLORS)[number]

export interface Tag {
  id: string
  name: string
  color: TagColor
  fileCount: number
}

/** One deleted File, or one deleted Folder with everything that was in it. */
export interface TrashEntry {
  id: string
  kind: 'folder' | 'file'
  name: string
  mimeType: string | null
  /** A File's size, or the total of the Files that went with a Folder. */
  size: number
  /** Folders: how many Files went to Trash with it. */
  fileCount: number | null
  thumbnail: boolean
  /** Names of the Folders it was in, from the root down. */
  from: string[]
  trashedAt: string
  purgeAt: string
}

export interface Restored {
  id: string
  kind: 'folder' | 'file'
  name: string
  renamed: boolean
  /** The Folder it landed in, from the top; empty for the root. */
  path: Crumb[]
}

/** A Share link, as its Owner sees it. */
export interface ShareLink {
  id: string
  token: string
  itemId: string
  item: {
    kind: 'folder' | 'file'
    name: string
    mimeType: string | null
    size: number | null
    thumbnail: boolean
    /** The Folder it sits in, from the top; null while it's in Trash. */
    path: Crumb[] | null
  }
  hasPassword: boolean
  expiresAt: string | null
  maxDownloads: number | null
  downloads: number
  views: number
  lastAccessedAt: string | null
  createdAt: string
  status: 'active' | 'expired' | 'used-up' | 'trashed'
}

/** An Item as a Share link's visitor sees it. */
export type SharedItem = Omit<LibraryItem, 'parentId' | 'tags' | 'shared' | 'path'>

/** What opening a Share link returns. */
export interface SharedRoot {
  item: SharedItem
  ownerName: string
  expiresAt: string | null
  /** Viewing in the browser; off while downloads are limited. */
  previews: boolean
}

export interface SharedListing {
  folder: Crumb
  /** From the shared Folder down. */
  path: Crumb[]
  items: SharedItem[]
}
