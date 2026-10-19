<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ title: string; description?: string }>()
</script>

<template>
  <DialogRoot v-model:open="open">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] dark:bg-black/50" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-panel border border-line bg-surface p-6 shadow-float"
      >
        <div class="flex flex-col gap-1.5 pr-8">
          <DialogTitle class="text-lg font-bold">{{ props.title }}</DialogTitle>
          <DialogDescription v-if="props.description" class="text-muted">{{ props.description }}</DialogDescription>
        </div>
        <slot />
        <DialogClose
          class="absolute top-4 right-4 grid size-8 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
          aria-label="Close"
        >
          <Icon name="lucide:x" class="size-4" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
