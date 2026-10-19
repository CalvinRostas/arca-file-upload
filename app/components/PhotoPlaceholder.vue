<!-- Preview-only stand-in for a photo thumbnail: a flat little landscape. -->
<script setup lang="ts">
const props = defineProps<{ sky: string; sun: string; hills: [string, string]; variant?: number }>()
const sunX = computed(() => 18 + (((props.variant ?? 0) * 23) % 64))
</script>

<template>
  <svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" class="size-full" aria-hidden="true">
    <rect width="100" height="75" :fill="sky" />
    <circle :cx="sunX" cy="26" r="9" :fill="sun" />
    <path d="M0 52 Q 22 34 46 48 T 100 42 V75 H0Z" :fill="hills[0]" />
    <path d="M0 62 Q 30 50 58 60 T 100 56 V75 H0Z" :fill="hills[1]" />
  </svg>
</template>
