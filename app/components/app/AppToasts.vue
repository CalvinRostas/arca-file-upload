<script setup lang="ts">
const { toasts, dismiss } = useToasts()
const busy = ref<number | null>(null)

async function act(id: number, run: () => unknown) {
  busy.value = id
  try {
    await run()
  } finally {
    busy.value = null
    dismiss(id)
  }
}
</script>

<template>
  <div v-if="toasts.length" class="flex flex-col gap-2">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      role="status"
      class="pointer-events-auto flex items-center gap-3 rounded-panel border border-line bg-surface py-2 pr-2 pl-4 shadow-float"
    >
      <Icon :name="toast.icon" class="size-4.5 shrink-0 text-accent" />
      <p class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{{ toast.message }}</p>
      <UiButton v-if="toast.action" size="sm" :loading="busy === toast.id" @click="act(toast.id, toast.action.run)">
        {{ toast.action.label }}
      </UiButton>
      <button
        type="button"
        class="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
        aria-label="Dismiss"
        @click="dismiss(toast.id)"
      >
        <Icon name="lucide:x" class="size-4" />
      </button>
    </div>
  </div>
</template>
