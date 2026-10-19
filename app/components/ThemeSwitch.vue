<script setup lang="ts">
const colorMode = useColorMode()

const options = [
  { value: 'light', label: 'Light', icon: 'lucide:sun' },
  { value: 'dark', label: 'Dark', icon: 'lucide:moon' },
  { value: 'system', label: 'Match system', icon: 'lucide:monitor' },
] as const

const preference = computed({
  get: () => colorMode.preference,
  set: (value: string | undefined) => {
    if (value) colorMode.preference = value
  },
})
</script>

<template>
  <ToggleGroupRoot
    v-model="preference"
    type="single"
    aria-label="Theme"
    class="inline-flex rounded-full border border-line bg-sunken p-0.5"
  >
    <ToggleGroupItem
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :aria-label="option.label"
      :title="option.label"
      class="grid size-7 place-items-center rounded-full text-muted transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm"
    >
      <Icon :name="option.icon" class="size-3.5" />
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>
