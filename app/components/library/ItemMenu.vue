<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

const props = defineProps<{ item: LibraryItem; triggerClass?: string }>()
const emit = defineEmits<{ open: []; rename: []; move: [] }>()

const isFolder = computed(() => props.item.kind === 'folder')
const downloadHref = computed(() =>
  isFolder.value ? `/api/zip?ids=${props.item.id}` : `/api/files/${props.item.id}/content`,
)
const menuItem =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      class="grid size-8 place-items-center rounded-full text-muted hover:text-ink"
      :class="props.triggerClass"
      :aria-label="`Actions for ${props.item.name}`"
      @click.stop
    >
      <Icon name="lucide:ellipsis" class="size-4" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        class="z-30 flex w-52 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
      >
        <DropdownMenuItem :class="menuItem" @select="emit('open')">
          <Icon :name="isFolder ? 'lucide:folder-open' : 'lucide:eye'" class="size-4 text-muted" /> Open
        </DropdownMenuItem>
        <DropdownMenuItem as-child :class="menuItem">
          <a :href="downloadHref" download>
            <Icon name="lucide:download" class="size-4 text-muted" />
            {{ isFolder ? 'Download as zip' : 'Download' }}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="my-1 h-px bg-line" />
        <DropdownMenuItem :class="menuItem" @select="emit('rename')">
          <Icon name="lucide:pencil" class="size-4 text-muted" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem :class="menuItem" @select="emit('move')">
          <Icon name="lucide:folder-input" class="size-4 text-muted" /> Move to…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
