import { TAG_COLORS, type Tag, type TagColor } from '~/types/library'

/** The signed-in person's Tags, shared across the app; refresh after any change. */
export function useTags() {
  const { data, refresh } = useFetch<Tag[]>('/api/tags', { key: 'tags', default: () => [], dedupe: 'defer' })
  const byId = computed(() => new Map(data.value.map((t) => [t.id, t])))
  return { tags: data, byId, refresh }
}

export const tagColor = (color: string) => `var(--tag-${color})`

/** The colour used least so far, so new tags spread across the palette. */
export function nextTagColor(tags: Tag[]): TagColor {
  const uses = new Map<TagColor, number>(TAG_COLORS.map((c) => [c, 0]))
  for (const t of tags) uses.set(t.color, (uses.get(t.color) ?? 0) + 1)
  return [...uses.entries()].sort((a, b) => a[1] - b[1])[0]![0]
}
