<!-- A File or Folder on a shared Folder's page: open it, or download a File directly. -->
<script setup lang="ts">
import type { SharedItem } from '~/types/library'

const props = defineProps<{ item: SharedItem }>()
const emit = defineEmits<{ open: [] }>()
const urls = useFileUrls()
const isFolder = computed(() => props.item.kind === 'folder')
const meta = computed(() =>
  isFolder.value
    ? `${props.item.childCount} ${props.item.childCount === 1 ? 'item' : 'items'}`
    : formatBytes(props.item.size ?? 0),
)
</script>

<template>
  <div class="group relative">
    <button
      type="button"
      class="flex w-full flex-col text-left"
      :class="isFolder ? 'gap-3 rounded-panel border border-line bg-surface p-2.5 hover:border-accent/40' : 'gap-2'"
      :aria-label="`${isFolder ? 'Open folder' : 'Open'} ${props.item.name}`"
      @click="emit('open')"
    >
      <FolderMosaic v-if="isFolder" :ids="props.item.mosaic ?? []" />
      <div
        v-else
        class="relative aspect-[4/3] w-full overflow-hidden rounded-tile bg-sunken ring-2 ring-transparent ring-offset-2 ring-offset-ground transition-shadow group-hover:ring-line"
      >
        <img
          v-if="props.item.thumbnail"
          :src="urls.thumbnail(props.item.id)"
          alt=""
          loading="lazy"
          class="size-full object-cover"
        />
        <div v-else class="flex size-full flex-col items-center justify-center gap-1.5 text-muted">
          <Icon :name="fileIcon(props.item.name, props.item.mimeType)" class="size-8" />
          <span v-if="fileExtension(props.item.name)" class="text-sm">{{ fileExtension(props.item.name) }}</span>
        </div>
        <span
          v-if="props.item.mimeType?.startsWith('video/')"
          class="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-black/55 text-white"
        >
          <Icon name="lucide:play" class="size-3.5" />
        </span>
      </div>
      <span class="flex items-baseline justify-between gap-2" :class="isFolder ? 'px-1.5 pb-1' : 'px-1'">
        <span class="truncate font-semibold">{{ props.item.name }}</span>
        <span class="shrink-0 text-sm text-faint">{{ meta }}</span>
      </span>
    </button>
    <a
      v-if="!isFolder"
      :href="urls.content(props.item.id)"
      download
      :aria-label="`Download ${props.item.name}`"
      class="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full bg-surface/90 text-muted opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100"
    >
      <Icon name="lucide:download" class="size-4" />
    </a>
  </div>
</template>
