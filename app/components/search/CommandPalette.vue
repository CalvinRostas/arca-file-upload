<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { LibraryItem } from '~/types/library'

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const { isAdmin } = useSession()
const { tags } = useTags()

const text = ref('')
const results = ref<LibraryItem[]>([])
const searching = ref(false)
const active = ref(0)
const onlyHere = ref(false)

/** The Folder being viewed, if any: offered as "only in this folder". */
const currentFolder = computed(() => (route.path.startsWith('/folders/') ? (route.params.id as string) : null))

interface Entry {
  id: string
  label: string
  detail?: string
  icon: string
  thumbnail?: string
  color?: string
  run: () => unknown
}

function searchUrl(q: string) {
  const query: Record<string, string> = { q }
  if (onlyHere.value && currentFolder.value) query.within = currentFolder.value
  return { path: '/search', query }
}

const entries = computed<Entry[]>(() => {
  const q = text.value.trim()
  if (!q) {
    return [
      { id: 'library', label: 'Go to Library', icon: 'lucide:library', run: () => navigateTo('/') },
      ...tags.value.slice(0, 6).map((t) => ({
        id: `tag-${t.id}`,
        label: `Files tagged ${t.name}`,
        icon: 'lucide:tag',
        color: t.color,
        run: () => navigateTo(searchUrl(`tag:${/\s/.test(t.name) ? `"${t.name}"` : t.name}`)),
      })),
      { id: 'shared', label: 'Shared', icon: 'lucide:link', run: () => navigateTo('/shared') },
      { id: 'trash', label: 'Trash', icon: 'lucide:trash-2', run: () => navigateTo('/trash') },
      ...(isAdmin.value
        ? [{ id: 'members', label: 'Members', icon: 'lucide:users', run: () => navigateTo('/admin/members') }]
        : []),
      {
        id: 'security',
        label: 'Password and sign-in',
        icon: 'lucide:shield-check',
        run: () => navigateTo('/settings/security'),
      },
    ]
  }
  return [
    ...results.value.slice(0, 7).map((item) => ({
      id: item.id,
      label: item.name,
      detail: ['Library', ...(item.path ?? []).map((c) => c.name)].join(' / '),
      icon: item.kind === 'folder' ? 'lucide:folder' : fileIcon(item.name, item.mimeType),
      thumbnail: item.thumbnail ? `/api/files/${item.id}/thumbnail` : undefined,
      run: () =>
        item.kind === 'folder'
          ? navigateTo(`/folders/${item.id}`)
          : navigateTo({ path: item.parentId ? `/folders/${item.parentId}` : '/', query: { open: item.id } }),
    })),
    {
      id: 'all',
      label: `See all results for “${q}”`,
      icon: 'lucide:search',
      run: () => navigateTo(searchUrl(q)),
    },
  ]
})

const fetchResults = useDebounceFn(async (q: string) => {
  const query: Record<string, string> = { q }
  if (onlyHere.value && currentFolder.value) query.within = currentFolder.value
  try {
    const response = await $fetch<{ results: LibraryItem[] }>('/api/search', { query })
    if (q === text.value.trim()) results.value = response.results
  } finally {
    searching.value = false
  }
}, 150)

watch([text, onlyHere], () => {
  active.value = 0
  const q = text.value.trim()
  if (!q) {
    results.value = []
    return
  }
  searching.value = true
  void fetchResults(q)
})

watch(open, (isOpen) => {
  if (isOpen) {
    text.value = ''
    results.value = []
    active.value = 0
    onlyHere.value = false
  }
})

function choose(entry: Entry | undefined) {
  if (!entry) return
  open.value = false
  void entry.run()
}

function onKeydown(event: KeyboardEvent) {
  const count = entries.value.length
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % count
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + count) % count
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(entries.value[active.value])
  }
}

const listId = useId()
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" />
      <DialogContent
        class="fixed top-[12vh] left-1/2 z-50 flex max-h-[70dvh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-float"
      >
        <DialogTitle class="sr-only">Search and go to</DialogTitle>
        <DialogDescription class="sr-only">Type to search your files. Use the arrow keys and Enter.</DialogDescription>
        <div class="flex items-center gap-3 border-b border-line px-4">
          <Icon
            :name="searching ? 'lucide:loader-circle' : 'lucide:search'"
            class="size-5 shrink-0 text-muted"
            :class="searching && 'animate-spin'"
          />
          <input
            v-model="text"
            role="combobox"
            aria-label="Search"
            :aria-controls="listId"
            aria-expanded="true"
            :aria-activedescendant="entries[active] ? `${listId}-${entries[active]!.id}` : undefined"
            placeholder="Search files, folders, tags…"
            class="h-14 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-faint"
            autofocus
            @keydown="onKeydown"
          />
          <kbd class="hidden rounded-md border border-line px-1.5 text-xs text-faint sm:block">Esc</kbd>
        </div>

        <ul :id="listId" role="listbox" aria-label="Results" class="flex-1 overflow-y-auto p-2">
          <li
            v-for="(entry, i) in entries"
            :id="`${listId}-${entry.id}`"
            :key="entry.id"
            role="option"
            :aria-selected="i === active"
            class="flex cursor-default items-center gap-3 rounded-control px-3 py-2"
            :class="i === active ? 'bg-accent-wash text-accent-strong' : ''"
            @mousemove="active = i"
            @click="choose(entry)"
          >
            <span class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.5rem] bg-sunken text-muted">
              <img v-if="entry.thumbnail" :src="entry.thumbnail" alt="" class="size-full object-cover" />
              <span
                v-else-if="entry.color"
                class="size-3 rounded-full"
                :style="{ background: tagColor(entry.color) }"
              />
              <Icon v-else :name="entry.icon" class="size-4" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold">{{ entry.label }}</span>
              <span v-if="entry.detail" class="truncate text-sm text-faint">{{ entry.detail }}</span>
            </span>
            <Icon v-if="i === active" name="lucide:corner-down-left" class="size-4 shrink-0" />
          </li>
        </ul>

        <div class="flex items-center gap-4 border-t border-line px-4 py-2.5 text-sm text-muted">
          <label v-if="currentFolder" class="flex items-center gap-2">
            <input v-model="onlyHere" type="checkbox" class="size-4 accent-(--verdigris)" />
            Only in this folder
          </label>
          <span class="ml-auto hidden sm:inline">Filters: tag: type: in: after: before:</span>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
