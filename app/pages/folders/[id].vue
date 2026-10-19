<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <LibraryView :key="route.params.id as string" :folder-id="route.params.id as string" />
</template>
