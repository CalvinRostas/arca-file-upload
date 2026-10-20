<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

export interface Crumb {
  label: string
  to: RouteLocationRaw
}

// "You are here": from the top down to the current Folder (the last crumb), with a way up.
const props = defineProps<{ crumbs: Crumb[]; rootIcon?: string }>()

/** Deep paths keep the top and the last two levels; the rest go behind "…". */
const MAX_SHOWN = 4
const collapsed = computed(() =>
  props.crumbs.length > MAX_SHOWN ? props.crumbs.slice(1, props.crumbs.length - (MAX_SHOWN - 2)) : [],
)
const shown = computed(() =>
  collapsed.value.length
    ? [props.crumbs[0]!, ...props.crumbs.slice(props.crumbs.length - (MAX_SHOWN - 2))]
    : props.crumbs,
)
const parent = computed(() => props.crumbs.at(-2))
const current = computed(() => props.crumbs.at(-1))

const crumbClass =
  'flex min-w-0 items-center gap-1.5 rounded-control px-2 py-1 text-muted transition-colors hover:bg-sunken hover:text-ink'
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <NuxtLink
      v-if="parent"
      :to="parent.to"
      class="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-sunken hover:text-ink"
      :aria-label="`Up to ${parent.label}`"
      :title="`Up to ${parent.label}`"
    >
      <Icon name="lucide:arrow-up" class="size-4" />
    </NuxtLink>
    <nav aria-label="Breadcrumb" class="min-w-0">
      <ol class="flex min-w-0 items-center gap-0.5 text-[0.95rem]">
        <template v-for="(crumb, i) in shown" :key="i">
          <li v-if="i > 0" aria-hidden="true" class="flex shrink-0 text-faint">
            <Icon name="lucide:chevron-right" class="size-4" />
          </li>
          <li v-if="i === 1 && collapsed.length" class="flex shrink-0 items-center gap-0.5">
            <DropdownMenuRoot>
              <DropdownMenuTrigger
                class="rounded-control px-2 py-1 text-muted hover:bg-sunken hover:text-ink"
                :aria-label="`${collapsed.length} more ${collapsed.length === 1 ? 'folder' : 'folders'}`"
              >
                …
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  align="start"
                  :side-offset="6"
                  class="z-30 flex max-w-72 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
                >
                  <DropdownMenuItem v-for="(hidden, j) in collapsed" :key="j" as-child>
                    <NuxtLink
                      :to="hidden.to"
                      class="flex items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken"
                    >
                      <Icon name="lucide:folder" class="size-4 shrink-0 text-muted" />
                      <span class="truncate">{{ hidden.label }}</span>
                    </NuxtLink>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
            <Icon name="lucide:chevron-right" class="size-4 text-faint" aria-hidden="true" />
          </li>
          <li class="min-w-0" :class="i === 0 ? 'shrink-0' : ''">
            <span
              v-if="crumb === current"
              aria-current="page"
              class="flex min-w-0 items-center gap-1.5 rounded-control bg-accent-wash px-2 py-1 font-semibold text-accent-strong"
            >
              <Icon :name="i === 0 ? (rootIcon ?? 'lucide:house') : 'lucide:folder-open'" class="size-4 shrink-0" />
              <span class="truncate">{{ crumb.label }}</span>
            </span>
            <NuxtLink v-else :to="crumb.to" :class="crumbClass">
              <Icon v-if="i === 0" :name="rootIcon ?? 'lucide:house'" class="size-4 shrink-0" />
              <span class="max-w-[14rem] truncate">{{ crumb.label }}</span>
            </NuxtLink>
          </li>
        </template>
      </ol>
    </nav>
  </div>
</template>
