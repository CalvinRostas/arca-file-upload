<!-- Looks like a search box; opens the command palette. Also owns the ⌘K and "/" shortcuts. -->
<script setup lang="ts">
const open = ref(false)
const isMac = ref(true)

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open.value = !open.value
    return
  }
  const target = event.target as HTMLElement
  if (event.key === '/' && !target.closest('input, textarea, [contenteditable], [role="dialog"]')) {
    event.preventDefault()
    open.value = true
  }
}

onMounted(() => {
  isMac.value = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <button
    type="button"
    class="flex h-10 w-full max-w-xl items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-left text-faint hover:border-accent/50"
    aria-label="Search everything"
    aria-keyshortcuts="Meta+K Control+K /"
    @click="open = true"
  >
    <Icon name="lucide:search" class="size-4 shrink-0 text-muted" />
    <span class="min-w-0 flex-1 truncate">Search files, tags, folders</span>
    <kbd class="hidden rounded-md border border-line px-1.5 text-xs sm:block">{{ isMac ? '⌘K' : 'Ctrl K' }}</kbd>
  </button>
  <CommandPalette v-model:open="open" />
</template>
