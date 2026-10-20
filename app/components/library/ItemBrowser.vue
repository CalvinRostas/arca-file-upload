<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

// Everything you can do with a set of Items once they're on screen: grid or list, select,
// open in the viewer, rename, move, tag, download. Used by folders and by search results.
const props = defineProps<{
  items: LibraryItem[]
  /** Where the move dialog starts browsing (the current Folder, or the root). */
  moveFrom: string | null
  /** Keep the given order instead of sorting (search results come ranked). */
  ranked?: boolean
  /** Open this File in the viewer right away (e.g. picked in the command palette). */
  openId?: string | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { view, compare } = useBrowsePrefs()

const sorted = (list: LibraryItem[]) => (props.ranked ? list : [...list].sort(compare))
const folders = computed(() => sorted(props.items.filter((i) => i.kind === 'folder')))
const files = computed(() => sorted(props.items.filter((i) => i.kind === 'file')))
/** Display order, for shift-click ranges and select-all. */
const ordered = computed(() =>
  props.ranked && view.value === 'list' ? props.items : [...folders.value, ...files.value],
)

// ── Selection ───────────────────────────────────────────────────────────────

const selected = ref(new Set<string>())
const selecting = computed(() => selected.value.size > 0)
let anchor: string | null = null

function select(item: LibraryItem, event: MouseEvent) {
  const next = new Set(selected.value)
  if (event.shiftKey && anchor) {
    const ids = ordered.value.map((i) => i.id)
    const [from, to] = [ids.indexOf(anchor), ids.indexOf(item.id)].sort((a, b) => a - b)
    for (const id of ids.slice(from, to! + 1)) next.add(id)
  } else if (next.has(item.id)) {
    next.delete(item.id)
  } else {
    next.add(item.id)
  }
  anchor = item.id
  selected.value = next
}

function clearSelection() {
  selected.value = new Set()
  anchor = null
}

watch(
  () => props.items,
  (items) => {
    // Drop selections of items that are gone (moved, filtered out, …).
    const present = new Set(items.map((i) => i.id))
    selected.value = new Set([...selected.value].filter((id) => present.has(id)))
  },
)

const selectedItems = computed(() => props.items.filter((i) => selected.value.has(i.id)))
const selectedFiles = computed(() => selectedItems.value.filter((i) => i.kind === 'file'))
const selectionDownload = computed(() => {
  const only = selectedItems.value.length === 1 ? selectedItems.value[0] : null
  return only?.kind === 'file'
    ? `/api/files/${only.id}/content`
    : `/api/zip?ids=${selectedItems.value.map((i) => i.id).join(',')}`
})

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, [role="dialog"], [role="menu"]')) return
  if (event.key === 'Escape' && selecting.value) clearSelection()
  // Delete, or ⌘⌫ as in Finder.
  if (selecting.value && (event.key === 'Delete' || (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)))) {
    event.preventDefault()
    void trash(selectedItems.value)
  }
  if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    selected.value = new Set(ordered.value.map((i) => i.id))
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Open / rename / move / tag ──────────────────────────────────────────────

const viewerIndex = ref<number | null>(null)
watch(
  () => props.openId,
  (id) => {
    const index = id ? files.value.findIndex((f) => f.id === id) : -1
    if (index >= 0) viewerIndex.value = index
  },
  { immediate: true },
)

function open(item: LibraryItem) {
  if (item.kind === 'folder') return navigateTo(`/folders/${item.id}`)
  viewerIndex.value = files.value.findIndex((f) => f.id === item.id)
}

const moveOpen = ref(false)
const moveIds = ref<string[]>([])
function move(ids: string[]) {
  moveIds.value = ids
  moveOpen.value = true
}

const tagOpen = ref(false)
const tagFiles = ref<LibraryItem[]>([])
function editTags(items: LibraryItem[]) {
  tagFiles.value = items
  tagOpen.value = true
}

function changed() {
  emit('changed')
}

// Recoverable, with Undo in the confirmation, so no "are you sure?".
const { moveToTrash } = useTrash()
async function trash(items: LibraryItem[]) {
  if (await moveToTrash(items)) clearSelection()
}

const rename = reactive({ open: false, item: null as LibraryItem | null, name: '', error: '', busy: false })
function startRename(item: LibraryItem) {
  Object.assign(rename, { open: true, item, name: item.name, error: '' })
}
async function saveRename() {
  rename.error = ''
  rename.busy = true
  try {
    await $fetch(`/api/items/${rename.item!.id}`, { method: 'PATCH', body: { name: rename.name } })
    rename.open = false
    changed()
  } catch (e) {
    rename.error = apiErrorMessage(e)
  } finally {
    rename.busy = false
  }
}

defineExpose({ clearSelection })
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- Selection bar: floats under the header while something is selected. -->
    <div
      v-if="selecting"
      role="toolbar"
      aria-label="Selection"
      class="sticky top-16 z-10 -my-4 flex flex-wrap items-center gap-2 rounded-panel border border-accent/30 bg-accent-wash px-4 py-2.5 shadow-float"
    >
      <span class="mr-auto font-semibold text-accent-strong">{{ selected.size }} selected</span>
      <a
        :href="selectionDownload"
        download
        class="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-sm font-semibold hover:bg-sunken"
      >
        <Icon name="lucide:download" class="size-4" /> Download
      </a>
      <UiButton v-if="selectedFiles.length" size="sm" icon="lucide:tag" @click="editTags(selectedFiles)">
        Tags…
      </UiButton>
      <UiButton size="sm" icon="lucide:folder-input" @click="move([...selected])">Move to…</UiButton>
      <UiButton size="sm" variant="danger" icon="lucide:trash-2" @click="trash(selectedItems)">Move to Trash</UiButton>
      <UiButton size="sm" variant="ghost" icon="lucide:x" @click="clearSelection">Clear</UiButton>
    </div>

    <template v-if="view === 'grid'">
      <section v-if="folders.length" aria-labelledby="folders-h" class="flex flex-col gap-3">
        <h2 id="folders-h" class="text-base font-semibold text-muted">Folders</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <ItemTile
            v-for="folder in folders"
            :key="folder.id"
            :item="folder"
            :selected="selected.has(folder.id)"
            :selecting="selecting"
            @open="open(folder)"
            @select="select(folder, $event)"
            @rename="startRename(folder)"
            @move="move([folder.id])"
            @trash="trash([folder])"
          />
        </div>
      </section>
      <section v-if="files.length" aria-labelledby="files-h" class="flex flex-col gap-3">
        <h2 id="files-h" class="text-base font-semibold text-muted">Files</h2>
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <ItemTile
            v-for="file in files"
            :key="file.id"
            :item="file"
            :selected="selected.has(file.id)"
            :selecting="selecting"
            @open="open(file)"
            @select="select(file, $event)"
            @rename="startRename(file)"
            @move="move([file.id])"
            @tags="editTags([file])"
            @trash="trash([file])"
          />
        </div>
      </section>
    </template>

    <section v-else aria-label="Items" class="overflow-hidden rounded-panel border border-line bg-surface">
      <div
        class="hidden grid-cols-[auto_1fr_6rem_6rem_8rem_auto] gap-3 border-b border-line px-3 py-2 text-sm font-semibold text-faint sm:grid"
        aria-hidden="true"
      >
        <span class="w-6" /><span>Name</span><span>Kind</span><span class="text-right">Size</span
        ><span class="text-right">Added</span><span class="w-8" />
      </div>
      <ItemRow
        v-for="item in ordered"
        :key="item.id"
        :item="item"
        :selected="selected.has(item.id)"
        :selecting="selecting"
        @open="open(item)"
        @select="select(item, $event)"
        @rename="startRename(item)"
        @move="move([item.id])"
        @tags="editTags([item])"
        @trash="trash([item])"
      />
    </section>

    <FileViewer v-model:index="viewerIndex" :files="files" />
    <MoveDialog v-model:open="moveOpen" :item-ids="moveIds" :from-folder-id="props.moveFrom" @moved="changed" />
    <TagDialog v-model:open="tagOpen" :files="tagFiles" @changed="changed" />

    <UiDialog v-model:open="rename.open" title="Rename">
      <form class="flex flex-col gap-5" @submit.prevent="saveRename">
        <UiField v-model="rename.name" label="Name" :error="rename.error" required autofocus />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="rename.open = false">Cancel</UiButton>
          <UiButton type="submit" variant="primary" :loading="rename.busy">Rename</UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>
