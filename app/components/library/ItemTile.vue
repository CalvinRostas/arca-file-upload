<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

const props = defineProps<{ item: LibraryItem }>()
const emit = defineEmits<{ rename: [item: LibraryItem] }>()

const isFolder = computed(() => props.item.kind === 'folder')
const href = computed(() => (isFolder.value ? `/folders/${props.item.id}` : `/api/files/${props.item.id}/content`))
const meta = computed(() =>
  isFolder.value
    ? `${props.item.childCount} ${props.item.childCount === 1 ? 'item' : 'items'}`
    : formatBytes(props.item.size ?? 0),
)

const menuItem =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
</script>

<template>
  <div class="group relative">
    <NuxtLink
      v-if="isFolder"
      :to="href"
      class="flex flex-col gap-3 rounded-panel border border-line bg-surface p-2.5 transition-colors hover:border-accent/40"
    >
      <div class="grid aspect-[16/9] place-items-center rounded-tile bg-sunken text-faint">
        <Icon name="lucide:folder" class="size-9" />
      </div>
      <div class="flex items-baseline justify-between gap-2 px-1.5 pb-1">
        <span class="truncate font-semibold">{{ props.item.name }}</span>
        <span class="shrink-0 text-sm text-faint">{{ meta }}</span>
      </div>
    </NuxtLink>

    <a v-else :href="href" download class="flex flex-col gap-2" :title="`Download ${props.item.name}`">
      <div
        class="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-tile bg-sunken text-muted ring-2 ring-transparent ring-offset-2 ring-offset-ground transition-shadow group-hover:ring-line"
      >
        <Icon :name="fileIcon(props.item.name, props.item.mimeType)" class="size-8" />
        <span v-if="fileExtension(props.item.name)" class="text-sm">{{ fileExtension(props.item.name) }}</span>
      </div>
      <div class="flex flex-col gap-0.5 px-1">
        <span class="truncate font-semibold">{{ props.item.name }}</span>
        <span class="flex items-center gap-2 text-sm text-faint">
          {{ meta }}
          <span class="ml-auto">{{ formatDate(props.item.createdAt) }}</span>
        </span>
      </div>
    </a>

    <DropdownMenuRoot>
      <DropdownMenuTrigger
        class="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full bg-surface/90 text-muted opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        :aria-label="`Actions for ${props.item.name}`"
      >
        <Icon name="lucide:ellipsis" class="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="6"
          class="z-30 flex w-48 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
        >
          <DropdownMenuItem v-if="!isFolder" as-child :class="menuItem">
            <a :href="href" download><Icon name="lucide:download" class="size-4 text-muted" /> Download</a>
          </DropdownMenuItem>
          <DropdownMenuItem :class="menuItem" @select="emit('rename', props.item)">
            <Icon name="lucide:pencil" class="size-4 text-muted" /> Rename
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
