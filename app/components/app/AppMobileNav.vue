<script setup lang="ts">
const open = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => (open.value = false),
)
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger
      class="grid size-9 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
      aria-label="Open menu"
    >
      <Icon name="lucide:menu" class="size-5" />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/30 dark:bg-black/50" />
      <DialogContent class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-ground px-4 py-5 shadow-float">
        <DialogTitle class="flex items-center gap-2.5 px-2">
          <BrandMark class="size-7 text-ink" />
          <span class="text-lg font-bold tracking-tight">Arca</span>
        </DialogTitle>
        <DialogDescription class="sr-only">Main navigation</DialogDescription>
        <AppNavLinks />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
