import type { LibraryItem, SortOrder, ViewMode } from '~/types/library'

export const SORT_LABELS: Record<SortOrder, string> = {
  name: 'Name',
  newest: 'Newest first',
  largest: 'Largest first',
}

/** Grid/list and sort order, in cookies so the server renders the same layout. */
export function useBrowsePrefs() {
  const view = useCookie<ViewMode>('arca-view', { default: () => 'grid', sameSite: 'lax', maxAge: 31536000 })
  const sort = useCookie<SortOrder>('arca-sort', { default: () => 'name', sameSite: 'lax', maxAge: 31536000 })

  function compare(a: LibraryItem, b: LibraryItem) {
    if (sort.value === 'newest') return b.createdAt.localeCompare(a.createdAt)
    if (sort.value === 'largest' && a.kind === 'file') return (b.size ?? 0) - (a.size ?? 0)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  }

  return { view, sort, compare }
}
