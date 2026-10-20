<script setup lang="ts">
import type { TrashEntry } from '~/types/library'

useHead({ title: 'Trash · Arca' })

const { data: entries, refresh } = await useFetch<TrashEntry[]>('/api/trash', { default: () => [] })
watch(useUploads().libraryVersion, () => refresh())
const { restore } = useTrash()
const toasts = useToasts()

const total = computed(() => entries.value.reduce((sum, e) => sum + e.size, 0))
const DAY = 86_400_000
/** Gone within three days: say so in the danger colour. */
const soon = (entry: TrashEntry) => new Date(entry.purgeAt).getTime() - Date.now() < 3 * DAY

const fromLabel = (entry: TrashEntry) => ['Library', ...entry.from].join(' / ')
function meta(entry: TrashEntry) {
  if (entry.kind === 'file') return formatBytes(entry.size)
  const files = `${entry.fileCount} ${entry.fileCount === 1 ? 'file' : 'files'}`
  return entry.fileCount ? `Folder · ${files} · ${formatBytes(entry.size)}` : 'Empty folder'
}

// ── Selection ───────────────────────────────────────────────────────────────

const selected = ref(new Set<string>())
const selecting = computed(() => selected.value.size > 0)
function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
watch(entries, (list) => {
  const present = new Set(list.map((e) => e.id))
  selected.value = new Set([...selected.value].filter((id) => present.has(id)))
})

// ── Restore / delete forever ────────────────────────────────────────────────

const restoring = ref<string | null>(null)
async function restoreEntries(ids: string[]) {
  restoring.value = ids.length === 1 ? ids[0]! : 'selection'
  try {
    if (await restore(ids)) selected.value = new Set()
  } finally {
    restoring.value = null
  }
}

const confirm = reactive({ open: false, ids: [] as string[] | 'all', busy: false, error: '' })
const confirmTitle = computed(() => {
  if (confirm.ids === 'all') return 'Empty Trash?'
  const [only] = confirm.ids
  const entry = confirm.ids.length === 1 ? entries.value.find((e) => e.id === only) : undefined
  return entry ? `Delete “${entry.name}” forever?` : `Delete ${confirm.ids.length} items forever?`
})

function askDelete(ids: string[] | 'all') {
  Object.assign(confirm, { open: true, ids, error: '' })
}

async function deleteConfirmed() {
  confirm.busy = true
  confirm.error = ''
  try {
    if (confirm.ids === 'all') await $fetch('/api/trash', { method: 'DELETE' })
    else await $fetch('/api/trash/delete', { method: 'POST', body: { ids: confirm.ids } })
    const count = confirm.ids === 'all' ? entries.value.length : confirm.ids.length
    confirm.open = false
    selected.value = new Set()
    await refresh()
    toasts.show({ icon: 'lucide:trash-2', message: count === 1 ? 'Deleted forever' : `Deleted ${count} items forever` })
  } catch (e) {
    confirm.error = apiErrorMessage(e)
  } finally {
    confirm.busy = false
  }
}

const menuItem =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-wrap items-end gap-4">
      <div class="min-w-0">
        <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Trash</h1>
        <p class="text-muted">Deleted items stay here for 30 days, then they’re gone for good.</p>
      </div>
      <UiButton v-if="entries.length" class="ml-auto" variant="danger" icon="lucide:trash-2" @click="askDelete('all')">
        Empty Trash
      </UiButton>
    </div>

    <div
      v-if="entries.length === 0"
      class="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-20 text-center"
    >
      <Icon name="lucide:trash-2" class="size-12 text-faint" />
      <h2 class="text-lg font-semibold">Trash is empty</h2>
      <p class="max-w-sm text-muted">
        When you delete something, it waits here for 30 days in case you change your mind.
      </p>
    </div>

    <template v-else>
      <div
        v-if="selecting"
        role="toolbar"
        aria-label="Selection"
        class="sticky top-16 z-10 -my-4 flex flex-wrap items-center gap-2 rounded-panel border border-accent/30 bg-accent-wash px-4 py-2.5 shadow-float"
      >
        <span class="mr-auto font-semibold text-accent-strong">{{ selected.size }} selected</span>
        <UiButton
          size="sm"
          icon="lucide:undo-2"
          :loading="restoring === 'selection'"
          @click="restoreEntries([...selected])"
        >
          Restore
        </UiButton>
        <UiButton size="sm" variant="danger" icon="lucide:trash-2" @click="askDelete([...selected])">
          Delete forever
        </UiButton>
        <UiButton size="sm" variant="ghost" icon="lucide:x" @click="selected = new Set()">Clear</UiButton>
      </div>

      <section aria-label="Items in Trash" class="flex flex-col gap-3">
        <p class="text-sm text-faint">
          {{ entries.length }} {{ entries.length === 1 ? 'item' : 'items' }} · {{ formatBytes(total) }}
        </p>
        <ul class="overflow-hidden rounded-panel border border-line bg-surface">
          <li
            v-for="entry in entries"
            :key="entry.id"
            class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 sm:grid-cols-[auto_1fr_11rem_auto]"
            :class="selected.has(entry.id) ? 'bg-accent-wash' : 'hover:bg-sunken/60'"
          >
            <SelectBox
              :checked="selected.has(entry.id)"
              :label="`Select ${entry.name}`"
              class="[&:not([aria-checked=true])]:border-line [&:not([aria-checked=true])]:bg-transparent [&:not([aria-checked=true])]:backdrop-blur-none"
              @toggle="toggle(entry.id)"
            />
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[0.5rem] bg-sunken text-muted"
              >
                <img
                  v-if="entry.thumbnail"
                  :src="`/api/files/${entry.id}/thumbnail`"
                  alt=""
                  loading="lazy"
                  class="size-full object-cover opacity-80"
                />
                <Icon
                  v-else
                  :name="entry.kind === 'folder' ? 'lucide:folder' : fileIcon(entry.name, entry.mimeType)"
                  class="size-4.5"
                />
              </span>
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-semibold">{{ entry.name }}</span>
                <span class="truncate text-sm text-faint"> {{ meta(entry) }} · from {{ fromLabel(entry) }} </span>
              </span>
            </div>
            <span class="hidden flex-col text-right text-sm sm:flex">
              <span class="text-muted">Deleted {{ formatFromNow(entry.trashedAt) }}</span>
              <span :class="soon(entry) ? 'font-semibold text-danger' : 'text-faint'">
                Gone {{ formatFromNow(entry.purgeAt) }}
              </span>
            </span>
            <div class="flex items-center gap-1">
              <UiButton
                size="sm"
                icon="lucide:undo-2"
                :loading="restoring === entry.id"
                :aria-label="`Restore ${entry.name}`"
                @click="restoreEntries([entry.id])"
              >
                <span class="hidden md:inline">Restore</span>
              </UiButton>
              <DropdownMenuRoot>
                <DropdownMenuTrigger
                  class="grid size-8 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                  :aria-label="`More actions for ${entry.name}`"
                >
                  <Icon name="lucide:ellipsis" class="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    align="end"
                    :side-offset="6"
                    class="z-30 flex w-48 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
                  >
                    <DropdownMenuItem
                      :class="[menuItem, 'text-danger data-highlighted:bg-danger-wash']"
                      @select="askDelete([entry.id])"
                    >
                      <Icon name="lucide:trash-2" class="size-4" /> Delete forever
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <UiDialog v-model:open="confirm.open" :title="confirmTitle" description="This can’t be undone.">
      <UiAlert v-if="confirm.error">{{ confirm.error }}</UiAlert>
      <div class="flex justify-end gap-2">
        <UiButton variant="ghost" @click="confirm.open = false">Cancel</UiButton>
        <UiButton variant="danger" icon="lucide:trash-2" :loading="confirm.busy" @click="deleteConfirmed">
          {{ confirm.ids === 'all' ? 'Empty Trash' : 'Delete forever' }}
        </UiButton>
      </div>
    </UiDialog>
  </div>
</template>
