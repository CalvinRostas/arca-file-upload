<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

const props = defineProps<{ value: string; label: string }>()
const { copy, copied } = useClipboard({ legacy: true })
</script>

<template>
  <div class="flex items-center gap-2 rounded-control border border-line bg-sunken p-1 pl-3">
    <input
      :value="props.value"
      readonly
      :aria-label="props.label"
      class="min-w-0 flex-1 bg-transparent text-sm outline-none"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <UiButton size="sm" :icon="copied ? 'lucide:check' : 'lucide:copy'" @click="copy(props.value)">
      {{ copied ? 'Copied' : 'Copy' }}
    </UiButton>
  </div>
</template>
