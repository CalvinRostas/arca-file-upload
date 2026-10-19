<script setup lang="ts">
const props = withDefaults(defineProps<{ tone?: 'danger' | 'info' }>(), { tone: 'danger' })
</script>

<template>
  <div
    role="alert"
    class="flex gap-2.5 rounded-control px-3.5 py-2.5 text-sm"
    :class="props.tone === 'danger' ? 'bg-danger-wash text-danger' : 'bg-accent-wash text-accent-strong'"
  >
    <Icon :name="props.tone === 'danger' ? 'lucide:circle-alert' : 'lucide:info'" class="mt-0.5 size-4 shrink-0" />
    <div><slot /></div>
  </div>
</template>
