<!-- An on/off setting with a label; its details (the slot) show only while it's on. -->
<script setup lang="ts">
const model = defineModel<boolean>({ default: false })
const props = defineProps<{ label: string; hint?: string }>()
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <label :for="id" class="flex min-w-0 flex-col">
        <span class="font-semibold">{{ props.label }}</span>
        <span v-if="props.hint" class="text-sm text-muted">{{ props.hint }}</span>
      </label>
      <SwitchRoot
        :id="id"
        v-model="model"
        class="relative flex h-6 w-10 shrink-0 items-center rounded-full bg-line px-0.5 transition-colors data-[state=checked]:bg-accent"
      >
        <SwitchThumb
          class="block size-5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-4"
        />
      </SwitchRoot>
    </div>
    <slot v-if="model" />
  </div>
</template>
