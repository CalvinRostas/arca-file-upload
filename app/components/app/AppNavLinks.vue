<script setup lang="ts">
const { isAdmin } = useSession()

const links = computed(() => [
  { to: '/', label: 'Library', icon: 'lucide:library' },
  ...(isAdmin.value ? [{ to: '/admin/members', label: 'Members', icon: 'lucide:users' }] : []),
])
</script>

<template>
  <nav class="flex flex-col gap-0.5" aria-label="Main">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="flex items-center gap-3 rounded-control px-3 py-2 text-muted hover:bg-sunken hover:text-ink"
      exact-active-class="bg-accent-wash! font-semibold text-accent-strong!"
    >
      <Icon :name="link.icon" class="size-4.5" />
      {{ link.label }}
    </NuxtLink>
  </nav>
</template>
