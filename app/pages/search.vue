<script setup lang="ts">
import {
  formatQuery,
  isEmptyQuery,
  parseQuery,
  SEARCH_TYPES,
  type SearchQuery,
  type SearchType,
} from '#shared/search-query'
import type { LibraryItem, Listing } from '~/types/library'

const route = useRoute()
const router = useRouter()
const { tags } = useTags()

const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const within = computed(() => (typeof route.query.within === 'string' ? route.query.within : ''))
const parsed = computed(() => parseQuery(q.value))
useHead({ title: computed(() => (q.value ? `${q.value} · Search · Arca` : 'Search · Arca')) })

const draft = ref(q.value)
watch(q, (value) => (draft.value = value))

const { data, refresh, pending } = await useFetch<{ results: LibraryItem[]; problems: string[] }>('/api/search', {
  query: computed(() => ({ q: q.value, within: within.value || undefined })),
})
const { data: withinFolder } = await useFetch<Listing>('/api/library', {
  query: computed(() => ({ folder: within.value || undefined })),
  immediate: !!within.value,
  watch: [within],
})

function go(next: { q?: string; within?: string | null }) {
  const query: Record<string, string> = {}
  const text = next.q ?? q.value
  const folder = next.within === undefined ? within.value : next.within
  if (text) query.q = text
  if (folder) query.within = folder
  void router.replace({ path: '/search', query })
}

function submit() {
  go({ q: draft.value.trim() })
}

/** Edit the parsed query and write it back as text, so chips and the box always agree. */
function edit(change: (query: SearchQuery) => void) {
  const next = parseQuery(q.value)
  change(next)
  go({ q: formatQuery(next) })
}

const typeLabels: Record<SearchType, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  pdf: 'PDFs',
  document: 'Documents',
  archive: 'Archives',
  text: 'Text',
  folder: 'Folders',
  file: 'Files',
}

const chips = computed(() => {
  const p = parsed.value
  const list: { key: string; label: string; icon: string; color?: string; remove: () => void }[] = []
  for (const t of p.tags) {
    const known = tags.value.find((x) => x.name.toLowerCase() === t.toLowerCase())
    list.push({
      key: `tag:${t}`,
      label: t,
      icon: 'lucide:tag',
      color: known?.color,
      remove: () => edit((n) => (n.tags = n.tags.filter((x) => x !== t))),
    })
  }
  for (const t of p.types) {
    list.push({
      key: `type:${t}`,
      label: typeLabels[t],
      icon: 'lucide:shapes',
      remove: () => edit((n) => (n.types = n.types.filter((x) => x !== t))),
    })
  }
  if (p.in)
    list.push({ key: 'in', label: `In /${p.in}`, icon: 'lucide:folder', remove: () => edit((n) => (n.in = null)) })
  if (p.after) {
    list.push({
      key: 'after',
      label: `After ${p.after}`,
      icon: 'lucide:calendar',
      remove: () => edit((n) => (n.after = null)),
    })
  }
  if (p.before) {
    list.push({
      key: 'before',
      label: `Before ${p.before}`,
      icon: 'lucide:calendar',
      remove: () => edit((n) => (n.before = null)),
    })
  }
  return list
})

const thisYear = new Date().getFullYear()
const dateOptions = [
  { label: `This year`, apply: (n: SearchQuery) => ((n.after = String(thisYear - 1)), (n.before = null)) },
  { label: `Last year`, apply: (n: SearchQuery) => ((n.after = String(thisYear - 2)), (n.before = String(thisYear))) },
  { label: `Before ${thisYear - 1}`, apply: (n: SearchQuery) => ((n.before = String(thisYear - 1)), (n.after = null)) },
]

const empty = computed(() => isEmptyQuery(parsed.value) && !within.value)
const examples = ['tag:family', 'type:pdf after:2024', 'invoice type:document', 'type:video in:/Photos']

const menuItem =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
const chipBase = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm'
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Search</h1>
      <ViewControls class="ml-auto" :sortable="false" />
    </div>

    <form role="search" class="flex flex-col gap-3" @submit.prevent="submit">
      <label
        class="flex h-12 items-center gap-3 rounded-full border border-line bg-surface px-5 focus-within:border-accent"
      >
        <Icon name="lucide:search" class="size-5 shrink-0 text-muted" />
        <input
          v-model="draft"
          type="search"
          aria-label="Search your library"
          placeholder="Search names, or filter: tag:family type:pdf in:/Photos after:2024"
          class="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-base placeholder:text-faint"
          autofocus
        />
        <UiButton type="submit" size="sm" variant="primary">Search</UiButton>
      </label>

      <div class="flex flex-wrap items-center gap-2" aria-label="Filters">
        <button
          v-if="within"
          type="button"
          :class="[chipBase, 'border-accent/30 bg-accent-wash text-accent-strong']"
          @click="go({ within: null })"
        >
          <Icon name="lucide:folder" class="size-3.5" />
          Only in {{ withinFolder?.folder?.name ?? 'this folder' }}
          <Icon name="lucide:x" class="size-3.5" aria-label="Remove filter" />
        </button>
        <button
          v-for="chip in chips"
          :key="chip.key"
          type="button"
          :class="[chipBase, 'border-accent/30 bg-accent-wash text-accent-strong']"
          :aria-label="`Remove filter ${chip.label}`"
          @click="chip.remove()"
        >
          <span v-if="chip.color" class="size-2 rounded-full" :style="{ background: tagColor(chip.color) }" />
          <Icon v-else :name="chip.icon" class="size-3.5" />
          {{ chip.label }}
          <Icon name="lucide:x" class="size-3.5" />
        </button>

        <DropdownMenuRoot>
          <DropdownMenuTrigger :class="[chipBase, 'border-line bg-surface text-muted hover:text-ink']">
            <Icon name="lucide:shapes" class="size-3.5" /> Type
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              :side-offset="6"
              class="z-30 flex w-44 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
            >
              <DropdownMenuItem
                v-for="t in SEARCH_TYPES"
                :key="t"
                :class="menuItem"
                @select="edit((n) => n.types.includes(t) || n.types.push(t))"
              >
                {{ typeLabels[t] }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <DropdownMenuRoot v-if="tags.length">
          <DropdownMenuTrigger :class="[chipBase, 'border-line bg-surface text-muted hover:text-ink']">
            <Icon name="lucide:tag" class="size-3.5" /> Tag
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              :side-offset="6"
              class="z-30 flex max-h-72 w-52 flex-col overflow-y-auto rounded-tile border border-line bg-surface p-1.5 shadow-float"
            >
              <DropdownMenuItem
                v-for="t in tags"
                :key="t.id"
                :class="menuItem"
                @select="
                  edit((n) => n.tags.some((x) => x.toLowerCase() === t.name.toLowerCase()) || n.tags.push(t.name))
                "
              >
                <span class="size-2.5 rounded-full" :style="{ background: tagColor(t.color) }" />
                <span class="flex-1 truncate">{{ t.name }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <DropdownMenuRoot>
          <DropdownMenuTrigger :class="[chipBase, 'border-line bg-surface text-muted hover:text-ink']">
            <Icon name="lucide:calendar" class="size-3.5" /> Added
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              :side-offset="6"
              class="z-30 flex w-44 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
            >
              <DropdownMenuItem
                v-for="option in dateOptions"
                :key="option.label"
                :class="menuItem"
                @select="edit(option.apply)"
              >
                {{ option.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>
    </form>

    <UiAlert v-for="problem in data?.problems ?? []" :key="problem" tone="info">{{ problem }}</UiAlert>

    <div v-if="empty" class="flex flex-col items-start gap-3 py-6">
      <p class="text-muted">Search by name, even with a typo, or narrow things down with filters. For example:</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="example in examples"
          :key="example"
          type="button"
          class="rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-accent"
          @click="go({ q: example })"
        >
          {{ example }}
        </button>
      </div>
    </div>

    <template v-else-if="data">
      <p class="-mb-2 text-sm text-muted" aria-live="polite">
        {{ pending ? 'Searching…' : `${data.results.length} ${data.results.length === 1 ? 'result' : 'results'}` }}
      </p>
      <div
        v-if="data.results.length === 0 && !pending"
        class="flex flex-col items-center gap-3 rounded-panel border border-dashed border-line px-6 py-16 text-center"
      >
        <Icon name="lucide:search-x" class="size-10 text-faint" />
        <h2 class="text-lg font-semibold">Nothing matches</h2>
        <p class="max-w-sm text-muted">Try fewer words or remove a filter.</p>
      </div>
      <ItemBrowser v-else :items="data.results" :move-from="null" ranked @changed="refresh" />
    </template>
  </div>
</template>
