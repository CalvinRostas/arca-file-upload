<script setup lang="ts">
import type { CollisionDialog } from '#components'
import type { LibraryItem, Listing, SortOrder, ViewMode } from '~/types/library'

const props = defineProps<{ folderId: string | null }>()

const uploads = useUploads()
const {
  data: listing,
  refresh,
  error,
} = await useFetch<Listing>('/api/library', {
  query: computed(() => ({ folder: props.folderId ?? undefined })),
})
watch(uploads.libraryVersion, () => refresh())

const title = computed(() => listing.value?.folder?.name ?? 'Library')
useHead({ title: computed(() => `${title.value} · Arca`) })
const ancestors = computed(() => listing.value?.path.slice(0, -1) ?? [])

// ── View and sort (cookies, so the server renders the same layout) ─────────

const view = useCookie<ViewMode>('arca-view', { default: () => 'grid', sameSite: 'lax', maxAge: 31536000 })
const sort = useCookie<SortOrder>('arca-sort', { default: () => 'name', sameSite: 'lax', maxAge: 31536000 })
const sortLabels: Record<SortOrder, string> = { name: 'Name', newest: 'Newest first', largest: 'Largest first' }

function compare(a: LibraryItem, b: LibraryItem) {
  if (sort.value === 'newest') return b.createdAt.localeCompare(a.createdAt)
  if (sort.value === 'largest' && a.kind === 'file') return (b.size ?? 0) - (a.size ?? 0)
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}
const folders = computed(() => listing.value?.items.filter((i) => i.kind === 'folder').sort(compare) ?? [])
const files = computed(() => listing.value?.items.filter((i) => i.kind === 'file').sort(compare) ?? [])
/** Display order, for shift-click ranges and select-all. */
const ordered = computed(() => [...folders.value, ...files.value])

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
watch(() => props.folderId, clearSelection)
watch(listing, () => {
  // Drop selections of items that are gone (moved, renamed away, …).
  const present = new Set(listing.value?.items.map((i) => i.id))
  selected.value = new Set([...selected.value].filter((id) => present.has(id)))
})

const selectionDownload = computed(() => {
  const ids = [...selected.value]
  const only = ids.length === 1 ? listing.value?.items.find((i) => i.id === ids[0]) : null
  return only?.kind === 'file' ? `/api/files/${only.id}/content` : `/api/zip?ids=${ids.join(',')}`
})

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, [role="dialog"], [role="menu"]')) return
  if (event.key === 'Escape' && selecting.value) clearSelection()
  if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    selected.value = new Set(ordered.value.map((i) => i.id))
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Open / view / move ──────────────────────────────────────────────────────

const viewerIndex = ref<number | null>(null)

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
async function onMoved() {
  clearSelection()
  await refresh()
}

// ── Uploading ───────────────────────────────────────────────────────────────

const collision = ref<InstanceType<typeof CollisionDialog>>()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const uploadError = ref('')

async function upload(picked: PickedFile[]) {
  uploadError.value = ''
  picked = picked.filter((p) => !isJunk(p))
  if (picked.length === 0) return

  // Loose files get the collision prompt; files inside dropped folders are kept side by side.
  const loose = picked.filter((p) => !p.relativeDir)
  let choices = new Map<string, ConflictChoice>()
  if (loose.length > 0) {
    try {
      const { taken } = await $fetch('/api/library/taken-names', {
        method: 'POST',
        body: { folderId: props.folderId, names: loose.map((p) => p.file.name) },
      })
      if (taken.length > 0) {
        const answer = await collision.value!.ask(taken, title.value)
        if (!answer) return
        choices = answer
      }
    } catch (e) {
      uploadError.value = apiErrorMessage(e)
      return
    }
  }

  const queued = picked
    .map((p) => ({ ...p, onConflict: choices.get(p.file.name.toLowerCase()) ?? ('keepBoth' as const) }))
    .filter((p) => p.onConflict !== 'skip')
  uploads.add(queued, { id: props.folderId, name: title.value })
}

function onPickFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) void upload([...input.files].map((file) => ({ file, relativeDir: '' })))
  input.value = ''
}

function onPickFolder(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) void upload(filesFromFolderInput(input.files))
  input.value = ''
}

// Drag and drop anywhere on the view. A counter, because dragenter/leave fire for every child.
const dragDepth = ref(0)
const dragging = computed(() => dragDepth.value > 0)
const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

function onDragEnter(event: DragEvent) {
  if (carriesFiles(event)) dragDepth.value++
}
function onDragLeave(event: DragEvent) {
  if (carriesFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}
async function onDrop(event: DragEvent) {
  dragDepth.value = 0
  if (event.dataTransfer) await upload(await filesFromDrop(event.dataTransfer))
}

// ── New folder / rename ─────────────────────────────────────────────────────

const nameDialog = reactive({
  open: false,
  mode: 'create' as 'create' | 'rename',
  item: null as LibraryItem | null,
  name: '',
  error: '',
  busy: false,
})

function newFolder() {
  Object.assign(nameDialog, { open: true, mode: 'create', item: null, name: '', error: '' })
}

function rename(item: LibraryItem) {
  Object.assign(nameDialog, { open: true, mode: 'rename', item, name: item.name, error: '' })
}

async function saveName() {
  nameDialog.error = ''
  nameDialog.busy = true
  try {
    if (nameDialog.mode === 'create') {
      await $fetch('/api/folders', { method: 'POST', body: { parentId: props.folderId, name: nameDialog.name } })
    } else {
      await $fetch(`/api/items/${nameDialog.item!.id}`, { method: 'PATCH', body: { name: nameDialog.name } })
    }
    nameDialog.open = false
    await refresh()
  } catch (e) {
    nameDialog.error = apiErrorMessage(e)
  } finally {
    nameDialog.busy = false
  }
}

const menuItem =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
const segment =
  'grid size-8 place-items-center rounded-[0.5rem] text-muted data-[state=on]:bg-sunken data-[state=on]:text-ink'
</script>

<template>
  <div
    class="relative flex min-h-[calc(100dvh-8rem)] flex-col gap-8"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div v-if="error" class="flex flex-col items-start gap-3 py-16">
      <h1 class="text-[2rem] leading-tight font-bold tracking-tight">This folder isn’t available</h1>
      <p class="text-muted">It may have been moved or deleted.</p>
      <UiButton variant="primary" @click="navigateTo('/')">Go to your library</UiButton>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end gap-4">
        <div class="min-w-0">
          <nav
            v-if="listing?.folder"
            class="mb-1 flex flex-wrap items-center gap-1.5 text-sm text-muted"
            aria-label="Breadcrumb"
          >
            <NuxtLink to="/" class="hover:text-ink">Library</NuxtLink>
            <template v-for="crumb in ancestors" :key="crumb.id">
              <Icon name="lucide:chevron-right" class="size-3.5 text-faint" />
              <NuxtLink :to="`/folders/${crumb.id}`" class="hover:text-ink">{{ crumb.name }}</NuxtLink>
            </template>
          </nav>
          <h1 class="truncate text-[2rem] leading-tight font-bold tracking-tight">{{ title }}</h1>
        </div>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <UiButton size="sm" variant="ghost" icon="lucide:arrow-down-wide-narrow">{{ sortLabels[sort] }}</UiButton>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                :side-offset="6"
                class="z-30 flex w-48 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
              >
                <DropdownMenuRadioGroup v-model="sort">
                  <DropdownMenuRadioItem
                    v-for="(label, value) in sortLabels"
                    :key="value"
                    :value="value"
                    :class="menuItem"
                  >
                    <DropdownMenuItemIndicator class="absolute left-2.5"
                      ><Icon name="lucide:check" class="size-4 text-accent"
                    /></DropdownMenuItemIndicator>
                    <span class="pl-6">{{ label }}</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          <ToggleGroupRoot
            v-model="view"
            type="single"
            aria-label="Layout"
            class="inline-flex rounded-control border border-line bg-surface p-0.5"
          >
            <ToggleGroupItem value="grid" aria-label="Grid" :class="segment">
              <Icon name="lucide:layout-grid" class="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List" :class="segment">
              <Icon name="lucide:list" class="size-4" />
            </ToggleGroupItem>
          </ToggleGroupRoot>
          <UiButton icon="lucide:folder-plus" @click="newFolder">New folder</UiButton>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <UiButton variant="primary" icon="lucide:upload">Upload</UiButton>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                :side-offset="6"
                class="z-30 flex w-48 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
              >
                <DropdownMenuItem :class="menuItem" @select="fileInput?.click()">
                  <Icon name="lucide:file-up" class="size-4 text-muted" /> Files
                </DropdownMenuItem>
                <DropdownMenuItem :class="menuItem" @select="folderInput?.click()">
                  <Icon name="lucide:folder-up" class="size-4 text-muted" /> Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
          <input ref="fileInput" type="file" multiple class="hidden" @change="onPickFiles" />
          <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onPickFolder" />
        </div>
      </div>

      <!-- Selection bar: replaces nothing, floats under the header while something is selected. -->
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
        <UiButton size="sm" icon="lucide:folder-input" @click="move([...selected])">Move to…</UiButton>
        <UiButton size="sm" variant="ghost" icon="lucide:x" @click="clearSelection">Clear</UiButton>
      </div>

      <UiAlert v-if="uploadError">{{ uploadError }}</UiAlert>

      <div
        v-if="listing && listing.items.length === 0"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-20 text-center"
      >
        <Icon name="lucide:upload-cloud" class="size-12 text-faint" />
        <h2 class="text-lg font-semibold">{{ listing.folder ? 'This folder is empty' : 'Nothing here yet' }}</h2>
        <p class="max-w-sm text-muted">Drop files or folders here, or use Upload.</p>
      </div>

      <template v-else-if="view === 'grid'">
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
              @rename="rename(folder)"
              @move="move([folder.id])"
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
              @rename="rename(file)"
              @move="move([file.id])"
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
          @rename="rename(item)"
          @move="move([item.id])"
        />
      </section>
    </template>

    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-panel border-2 border-dashed border-accent bg-accent-wash/80 backdrop-blur-[1px]"
    >
      <div class="flex flex-col items-center gap-2 text-accent-strong">
        <Icon name="lucide:upload" class="size-10" />
        <p class="text-lg font-semibold">Drop to upload to {{ title }}</p>
      </div>
    </div>

    <CollisionDialog ref="collision" />
    <FileViewer v-model:index="viewerIndex" :files="files" />
    <MoveDialog v-model:open="moveOpen" :item-ids="moveIds" :from-folder-id="props.folderId" @moved="onMoved" />

    <UiDialog v-model:open="nameDialog.open" :title="nameDialog.mode === 'create' ? 'New folder' : 'Rename'">
      <form class="flex flex-col gap-5" @submit.prevent="saveName">
        <UiField v-model="nameDialog.name" label="Name" :error="nameDialog.error" required autofocus />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="nameDialog.open = false">Cancel</UiButton>
          <UiButton type="submit" variant="primary" :loading="nameDialog.busy">
            {{ nameDialog.mode === 'create' ? 'Create folder' : 'Rename' }}
          </UiButton>
        </div>
      </form>
    </UiDialog>
  </div>
</template>
