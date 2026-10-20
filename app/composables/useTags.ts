import type { Tag } from '~/types/library'

/** The signed-in person's Tags, shared across the app; refresh after any change. */
export function useTags() {
  const { data, refresh } = useFetch<Tag[]>('/api/tags', { key: 'tags', default: () => [], dedupe: 'defer' })
  const byId = computed(() => new Map(data.value.map((t) => [t.id, t])))
  return { tags: data, byId, refresh }
}

export const tagColor = (color: string) => `var(--tag-${color})`
