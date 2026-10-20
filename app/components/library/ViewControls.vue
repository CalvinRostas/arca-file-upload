<script setup lang="ts">
const { view, sort } = useBrowsePrefs()
const props = defineProps<{ sortable?: boolean }>()

const menuItem =
  'relative flex cursor-default items-center gap-2.5 rounded-[0.5rem] px-2.5 py-2 text-sm outline-none data-highlighted:bg-sunken'
const segment =
  'grid size-8 place-items-center rounded-[0.5rem] text-muted data-[state=on]:bg-sunken data-[state=on]:text-ink'
</script>

<template>
  <div class="flex items-center gap-2">
    <DropdownMenuRoot v-if="props.sortable !== false">
      <DropdownMenuTrigger as-child>
        <UiButton size="sm" variant="ghost" icon="lucide:arrow-down-wide-narrow">{{ SORT_LABELS[sort] }}</UiButton>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="6"
          class="z-30 flex w-48 flex-col rounded-tile border border-line bg-surface p-1.5 shadow-float"
        >
          <DropdownMenuRadioGroup v-model="sort">
            <DropdownMenuRadioItem v-for="(label, value) in SORT_LABELS" :key="value" :value="value" :class="menuItem">
              <DropdownMenuItemIndicator class="absolute left-2.5">
                <Icon name="lucide:check" class="size-4 text-accent" />
              </DropdownMenuItemIndicator>
              <span class="pl-6">{{ label }}</span>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <ToggleGroupRoot
      v-model="view"
      type="single"
      aria-label="Layout"
      class="inline-flex rounded-control border border-line bg-surface p-0.5"
    >
      <ToggleGroupItem value="grid" aria-label="Grid" :class="segment">
        <Icon name="lucide:layout-grid" class="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List" :class="segment">
        <Icon name="lucide:list" class="size-4" />
      </ToggleGroupItem>
    </ToggleGroupRoot>
  </div>
</template>
