<script setup lang="ts">
const { user, isAdmin, signOut } = useSession()

const initials = computed(() =>
  (user.value?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join(''),
)

const itemClass =
  'flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
</script>

<template>
  <DropdownMenuRoot v-if="user">
    <DropdownMenuTrigger
      class="grid size-9 place-items-center rounded-full bg-accent-wash text-sm font-bold text-accent-strong"
      :aria-label="`Account menu for ${user.name}`"
    >
      {{ initials }}
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="8"
        class="z-30 flex w-60 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
      >
        <div class="px-2.5 py-2">
          <p class="truncate font-semibold">{{ user.name }}</p>
          <p class="truncate text-sm text-muted">{{ user.email }}</p>
        </div>
        <DropdownMenuSeparator class="my-1 h-px bg-line" />
        <DropdownMenuItem :class="itemClass" @select="navigateTo('/settings/security')">
          <Icon name="lucide:shield-check" class="size-4 text-muted" /> Password and sign-in
        </DropdownMenuItem>
        <DropdownMenuItem v-if="isAdmin" :class="itemClass" @select="navigateTo('/admin/members')">
          <Icon name="lucide:users" class="size-4 text-muted" /> Members
        </DropdownMenuItem>
        <DropdownMenuSeparator class="my-1 h-px bg-line" />
        <DropdownMenuItem :class="itemClass" @select="signOut">
          <Icon name="lucide:log-out" class="size-4 text-muted" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
