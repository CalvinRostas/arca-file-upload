<script setup lang="ts">
const { isAdmin } = useSession()
const route = useRoute()

const links = computed(() => [
  { to: '/', label: 'Library', icon: 'lucide:library', match: /^\/($|folders\/)/ },
  { to: '/shared', label: 'Shared', icon: 'lucide:link', match: /^\/shared/ },
  { to: '/trash', label: 'Trash', icon: 'lucide:trash-2', match: /^\/trash/ },
  ...(isAdmin.value
    ? [{ to: '/admin/members', label: 'Members', icon: 'lucide:users', match: /^\/admin\/members/ }]
    : []),
])
</script>

<template>
  <nav class="flex flex-col gap-0.5" aria-label="Main">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="flex items-center gap-3 rounded-control px-3 py-2"
      :class="
        link.match.test(route.path)
          ? 'bg-accent-wash font-semibold text-accent-strong'
          : 'text-muted hover:bg-sunken hover:text-ink'
      "
      :aria-current="link.match.test(route.path) ? 'page' : undefined"
    >
      <Icon :name="link.icon" class="size-4.5" />
      {{ link.label }}
    </NuxtLink>
  </nav>
</template>
