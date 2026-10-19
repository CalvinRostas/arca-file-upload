<!-- The round checkbox on tiles and rows. A button, so shift/cmd-click reach the handler. -->
<script setup lang="ts">
const props = defineProps<{ checked: boolean; label: string }>()
const emit = defineEmits<{ toggle: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="props.checked"
    :aria-label="props.label"
    class="grid size-6 place-items-center rounded-full border-2 transition-colors"
    :class="
      props.checked
        ? 'border-accent bg-accent text-on-accent'
        : 'border-white/90 bg-black/20 text-transparent backdrop-blur-sm hover:bg-black/35'
    "
    @click.stop.prevent="emit('toggle', $event)"
  >
    <Icon name="lucide:check" class="size-3.5" />
  </button>
</template>
