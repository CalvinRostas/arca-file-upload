<script setup lang="ts">
import type { Listing } from '~/types/library'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ itemIds: string[]; fromFolderId: string | null }>()
const emit = defineEmits<{ moved: [] }>()

// Browse folders inside the dialog, starting where the items are now.
const browsing = ref<string | null>(null)
const listing = ref<Listing | null>(null)
const error = ref('')
const busy = ref(false)

async function load(folderId: string | null) {
  error.value = ''
  listing.value = null
  browsing.value = folderId
  listing.value = await $fetch<Listing>('/api/library', { query: { folder: folderId ?? undefined } })
}

watch(open, (isOpen) => {
  if (isOpen) void load(props.fromFolderId)
})

const moving = computed(() => new Set(props.itemIds))
const folders = computed(() => listing.value?.items.filter((i) => i.kind === 'folder') ?? [])
const here = computed(() => listing.value?.folder?.name ?? 'Library')
const count = computed(() => props.itemIds.length)

async function moveHere() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/items/move', { method: 'POST', body: { ids: props.itemIds, targetId: browsing.value } })
    open.value = false
    emit('moved')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="`Move ${count} ${count === 1 ? 'item' : 'items'}`">
    <div class="flex flex-col gap-3">
      <nav class="flex flex-wrap items-center gap-1.5 text-sm text-muted" aria-label="Folder path">
        <button type="button" class="hover:text-ink" @click="load(null)">Library</button>
        <template v-for="crumb in listing?.path ?? []" :key="crumb.id">
          <Icon name="lucide:chevron-right" class="size-3.5 text-faint" />
          <button type="button" class="hover:text-ink" @click="load(crumb.id)">{{ crumb.name }}</button>
        </template>
      </nav>
      <ul class="flex max-h-72 min-h-40 flex-col overflow-y-auto rounded-tile border border-line">
        <li v-for="folder in folders" :key="folder.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="moving.has(folder.id)"
            @click="load(folder.id)"
          >
            <Icon name="lucide:folder" class="size-4.5 text-faint" />
            <span class="flex-1 truncate">{{ folder.name }}</span>
            <Icon name="lucide:chevron-right" class="size-4 text-faint" />
          </button>
        </li>
        <li v-if="listing && folders.length === 0" class="m-auto p-6 text-sm text-muted">No folders in here</li>
      </ul>
    </div>
    <UiAlert v-if="error">{{ error }}</UiAlert>
    <div class="flex justify-end gap-2">
      <UiButton variant="ghost" @click="open = false">Cancel</UiButton>
      <UiButton variant="primary" :loading="busy" :disabled="browsing === props.fromFolderId" @click="moveHere">
        {{ listing ? `Move to ${here}` : 'Move here' }}
      </UiButton>
    </div>
  </UiDialog>
</template>
