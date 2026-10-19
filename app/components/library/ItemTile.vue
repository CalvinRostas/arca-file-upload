<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

const props = defineProps<{ item: LibraryItem; selected: boolean; selecting: boolean }>()
const emit = defineEmits<{ open: []; select: [event: MouseEvent]; rename: []; move: [] }>()

const isFolder = computed(() => props.item.kind === 'folder')
const meta = computed(() =>
  isFolder.value
    ? `${props.item.childCount} ${props.item.childCount === 1 ? 'item' : 'items'}`
    : formatBytes(props.item.size ?? 0),
)

/** While selecting (or with shift/cmd/ctrl), a click selects instead of opening. */
function onClick(event: MouseEvent) {
  if (props.selecting || event.shiftKey || event.metaKey || event.ctrlKey) emit('select', event)
  else emit('open')
}
</script>

<template>
  <div class="group relative" :data-selected="props.selected || undefined">
    <button
      type="button"
      class="flex w-full flex-col text-left"
      :class="
        isFolder
          ? 'gap-3 rounded-panel border bg-surface p-2.5 transition-colors ' +
            (props.selected ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-accent/40')
          : 'gap-2'
      "
      :aria-label="`${isFolder ? 'Open folder' : 'Open'} ${props.item.name}`"
      @click="onClick"
    >
      <FolderMosaic v-if="isFolder" :ids="props.item.mosaic ?? []" />
      <div
        v-else
        class="relative aspect-[4/3] w-full overflow-hidden rounded-tile bg-sunken ring-2 ring-offset-2 ring-offset-ground transition-shadow"
        :class="props.selected ? 'ring-accent' : 'ring-transparent group-hover:ring-line'"
      >
        <img
          v-if="props.item.thumbnail"
          :src="`/api/files/${props.item.id}/thumbnail`"
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

      <div v-if="isFolder" class="flex items-baseline justify-between gap-2 px-1.5 pb-1">
        <span class="truncate font-semibold">{{ props.item.name }}</span>
        <span class="shrink-0 text-sm text-faint">{{ meta }}</span>
      </div>
      <div v-else class="flex w-full flex-col gap-0.5 px-1">
        <span class="truncate font-semibold">{{ props.item.name }}</span>
        <span class="flex items-center gap-2 text-sm text-faint">
          {{ meta }}
          <span class="ml-auto">{{ formatDate(props.item.createdAt) }}</span>
        </span>
      </div>
    </button>

    <SelectBox
      :checked="props.selected"
      :label="`Select ${props.item.name}`"
      class="absolute top-3.5 left-3.5 transition-opacity"
      :class="
        props.selected || props.selecting
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
      "
      @toggle="emit('select', $event)"
    />
    <ItemMenu
      :item="props.item"
      trigger-class="absolute top-3.5 right-3.5 bg-surface/90 shadow-sm backdrop-blur opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
      @open="emit('open')"
      @rename="emit('rename')"
      @move="emit('move')"
    />
  </div>
</template>
