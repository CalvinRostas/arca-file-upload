<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

const props = defineProps<{ item: LibraryItem; selected: boolean; selecting: boolean }>()
const emit = defineEmits<{
  open: []
  select: [event: MouseEvent]
  rename: []
  move: []
  tags: []
  trash: []
}>()

const { byId: tagsById } = useTags()
const itemTags = computed(() => props.item.tags.map((id) => tagsById.value.get(id)).filter((t) => t !== undefined))
const pathLabel = computed(() =>
  props.item.path ? ['Library', ...props.item.path.map((c) => c.name)].join(' / ') : '',
)

const isFolder = computed(() => props.item.kind === 'folder')
const kindLabel = computed(() => {
  if (isFolder.value) return 'Folder'
  const ext = fileExtension(props.item.name)
  return ext ? ext.toUpperCase() : 'File'
})

function onClick(event: MouseEvent) {
  if (props.selecting || event.shiftKey || event.metaKey || event.ctrlKey) emit('select', event)
  else emit('open')
}
</script>

<template>
  <div
    class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 sm:grid-cols-[auto_1fr_6rem_6rem_8rem_auto]"
    :class="props.selected ? 'bg-accent-wash' : 'hover:bg-sunken/60'"
  >
    <SelectBox
      :checked="props.selected"
      :label="`Select ${props.item.name}`"
      class="[&:not([aria-checked=true])]:border-line [&:not([aria-checked=true])]:bg-transparent [&:not([aria-checked=true])]:backdrop-blur-none"
      @toggle="emit('select', $event)"
    />
    <button type="button" class="flex min-w-0 items-center gap-3 text-left" @click="onClick">
      <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[0.5rem] bg-sunken text-muted">
        <img
          v-if="props.item.thumbnail"
          :src="`/api/files/${props.item.id}/thumbnail`"
          alt=""
          loading="lazy"
          class="size-full object-cover"
        />
        <Icon
          v-else
          :name="isFolder ? 'lucide:folder' : fileIcon(props.item.name, props.item.mimeType)"
          class="size-4.5"
        />
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="flex items-center gap-2">
          <span class="truncate font-semibold">{{ props.item.name }}</span>
          <span
            v-for="t in itemTags"
            :key="t.id"
            class="size-2 shrink-0 rounded-full"
            :style="{ background: tagColor(t.color) }"
            :title="t.name"
          />
        </span>
        <span v-if="pathLabel" class="truncate text-sm text-faint">{{ pathLabel }}</span>
      </span>
    </button>
    <span class="hidden text-sm text-muted sm:block">{{ kindLabel }}</span>
    <span class="hidden text-right text-sm text-muted sm:block">
      {{ isFolder ? `${props.item.childCount} items` : formatBytes(props.item.size ?? 0) }}
    </span>
    <span class="hidden text-right text-sm text-muted sm:block">{{ formatDate(props.item.createdAt) }}</span>
    <ItemMenu
      :item="props.item"
      trigger-class="hover:bg-sunken"
      @open="emit('open')"
      @rename="emit('rename')"
      @move="emit('move')"
      @tags="emit('tags')"
      @trash="emit('trash')"
    />
  </div>
</template>
