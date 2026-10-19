<script setup lang="ts">
import type { CollisionDialog } from '#components'
import type { LibraryItem, Listing } from '~/types/library'

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

const folders = computed(() => listing.value?.items.filter((i) => i.kind === 'folder') ?? [])
const files = computed(() => listing.value?.items.filter((i) => i.kind === 'file') ?? [])
const ancestors = computed(() => listing.value?.path.slice(0, -1) ?? [])

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

        <div class="ml-auto flex items-center gap-2">
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

      <UiAlert v-if="uploadError">{{ uploadError }}</UiAlert>

      <div
        v-if="listing && listing.items.length === 0"
        class="flex flex-1 flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-20 text-center"
      >
        <Icon name="lucide:upload-cloud" class="size-12 text-faint" />
        <h2 class="text-lg font-semibold">{{ listing.folder ? 'This folder is empty' : 'Nothing here yet' }}</h2>
        <p class="max-w-sm text-muted">Drop files or folders here, or use Upload.</p>
      </div>

      <section v-if="folders.length" aria-labelledby="folders-h" class="flex flex-col gap-3">
        <h2 id="folders-h" class="text-base font-semibold text-muted">Folders</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <ItemTile v-for="folder in folders" :key="folder.id" :item="folder" @rename="rename" />
        </div>
      </section>

      <section v-if="files.length" aria-labelledby="files-h" class="flex flex-col gap-3">
        <h2 id="files-h" class="text-base font-semibold text-muted">Files</h2>
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <ItemTile v-for="file in files" :key="file.id" :item="file" @rename="rename" />
        </div>
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
