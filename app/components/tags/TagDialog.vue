<script setup lang="ts">
import { TAG_COLORS, type LibraryItem, type TagColor } from '~/types/library'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ files: LibraryItem[] }>()
const emit = defineEmits<{ changed: [] }>()

const { tags, refresh: refreshTags } = useTags()
const filter = ref('')
const error = ref('')
const busy = ref<string | null>(null)

// Local copy of each file's tags, so the checkboxes update right away.
const current = ref(new Map<string, Set<string>>())
watch(open, (isOpen) => {
  if (!isOpen) return
  filter.value = ''
  error.value = ''
  current.value = new Map(props.files.map((f) => [f.id, new Set(f.tags)]))
})

function state(tagId: string): boolean | 'mixed' {
  const sets = [...current.value.values()]
  const count = sets.filter((s) => s.has(tagId)).length
  if (count === 0) return false
  return count === sets.length ? true : 'mixed'
}

const visible = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? tags.value.filter((t) => t.name.toLowerCase().includes(q)) : tags.value
})
const canCreate = computed(() => {
  const q = filter.value.trim()
  return q.length > 0 && !tags.value.some((t) => t.name.toLowerCase() === q.toLowerCase())
})

async function apply(tagId: string, add: boolean) {
  const fileIds = props.files.map((f) => f.id)
  await $fetch('/api/tags/apply', {
    method: 'POST',
    body: { fileIds, add: add ? [tagId] : [], remove: add ? [] : [tagId] },
  })
  for (const set of current.value.values()) {
    if (add) set.add(tagId)
    else set.delete(tagId)
  }
  current.value = new Map(current.value)
}

async function toggle(tagId: string) {
  error.value = ''
  busy.value = tagId
  try {
    await apply(tagId, state(tagId) !== true)
    await refreshTags()
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = null
  }
}

/** The colour used least so far, so new tags spread across the palette. */
function nextColor(): TagColor {
  const uses = new Map<TagColor, number>(TAG_COLORS.map((c) => [c, 0]))
  for (const t of tags.value) uses.set(t.color, (uses.get(t.color) ?? 0) + 1)
  return [...uses.entries()].sort((a, b) => a[1] - b[1])[0]![0]
}

async function create() {
  error.value = ''
  busy.value = 'new'
  try {
    const created = await $fetch('/api/tags', { method: 'POST', body: { name: filter.value, color: nextColor() } })
    await apply(created.id, true)
    filter.value = ''
    await refreshTags()
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = null
  }
}

const title = computed(() =>
  props.files.length === 1 ? `Tags for ${props.files[0]!.name}` : `Tags for ${props.files.length} files`,
)
</script>

<template>
  <UiDialog v-model:open="open" :title="title">
    <form class="flex flex-col gap-3" @submit.prevent="canCreate ? create() : undefined">
      <div
        class="flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 focus-within:border-accent"
      >
        <Icon name="lucide:search" class="size-4 shrink-0 text-faint" />
        <input
          v-model="filter"
          aria-label="Find or create a tag"
          placeholder="Find or create a tag"
          class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          autofocus
        />
      </div>
      <UiAlert v-if="error">{{ error }}</UiAlert>
      <ul class="flex max-h-72 flex-col overflow-y-auto">
        <li v-for="t in visible" :key="t.id">
          <button
            type="button"
            role="checkbox"
            :aria-checked="state(t.id)"
            class="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left hover:bg-sunken disabled:opacity-60"
            :disabled="busy !== null"
            @click="toggle(t.id)"
          >
            <span
              class="grid size-5 shrink-0 place-items-center rounded-[0.375rem] border-2"
              :class="state(t.id) ? 'border-accent bg-accent text-on-accent' : 'border-line'"
            >
              <Icon v-if="state(t.id) === true" name="lucide:check" class="size-3.5" />
              <Icon v-else-if="state(t.id) === 'mixed'" name="lucide:minus" class="size-3.5" />
            </span>
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: tagColor(t.color) }" />
            <span class="flex-1 truncate">{{ t.name }}</span>
            <span class="text-sm text-faint">{{ t.fileCount }}</span>
          </button>
        </li>
        <li v-if="canCreate">
          <button
            type="submit"
            class="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left hover:bg-sunken"
            :disabled="busy !== null"
          >
            <Icon name="lucide:plus" class="size-5 shrink-0 text-accent" />
            <span class="flex-1 truncate">Create tag “{{ filter.trim() }}”</span>
          </button>
        </li>
        <li v-if="!canCreate && visible.length === 0" class="px-2.5 py-6 text-center text-sm text-muted">
          Type a name to create your first tag.
        </li>
      </ul>
    </form>
    <div class="flex justify-end">
      <UiButton variant="primary" @click="open = false">Done</UiButton>
    </div>
  </UiDialog>
</template>
