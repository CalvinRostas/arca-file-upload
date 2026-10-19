<script setup lang="ts">
import type { ConflictChoice } from '~/types/library'

// Asks, one name at a time, what to do with files whose names are taken (GLOSSARY: Name collision).
const open = ref(false)
const queue = ref<string[]>([])
const folderName = ref('')
const applyToRest = ref(false)
let decisions = new Map<string, ConflictChoice>()
let settle: (result: Map<string, ConflictChoice> | null) => void = () => {}

const current = computed(() => queue.value[0] ?? '')
const remaining = computed(() => queue.value.length - 1)
const keepBothName = computed(() => {
  const dot = current.value.lastIndexOf('.')
  return dot > 0 ? `${current.value.slice(0, dot)} (1)${current.value.slice(dot)}` : `${current.value} (1)`
})

/** Resolves with a choice per (lower-cased) name, or null if the person cancels the upload. */
function ask(names: string[], inFolder: string): Promise<Map<string, ConflictChoice> | null> {
  queue.value = [...names]
  folderName.value = inFolder
  applyToRest.value = false
  decisions = new Map()
  open.value = true
  return new Promise((resolve) => (settle = resolve))
}

function choose(choice: ConflictChoice) {
  const names = applyToRest.value ? queue.value : [current.value]
  for (const name of names) decisions.set(name.toLowerCase(), choice)
  queue.value = queue.value.slice(names.length)
  applyToRest.value = false
  if (queue.value.length === 0) {
    open.value = false
    settle(decisions)
  }
}

watch(open, (isOpen) => {
  if (!isOpen && queue.value.length > 0) {
    queue.value = []
    settle(null)
  }
})

defineExpose({ ask })

const options = computed(() => [
  {
    choice: 'replace' as const,
    label: 'Replace',
    icon: 'lucide:replace',
    detail: 'The current file moves to Trash.',
  },
  {
    choice: 'keepBoth' as const,
    label: 'Keep both',
    icon: 'lucide:copy-plus',
    detail: `The new one is saved as “${keepBothName.value}”.`,
  },
  { choice: 'skip' as const, label: 'Skip', icon: 'lucide:skip-forward', detail: 'Don’t upload this file.' },
])
</script>

<template>
  <UiDialog
    v-model:open="open"
    :title="`“${current}” is already in ${folderName}`"
    description="What should happen to the file you’re uploading?"
  >
    <div class="flex flex-col gap-2">
      <button
        v-for="option in options"
        :key="option.choice"
        type="button"
        class="flex items-center gap-3.5 rounded-tile border border-line px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-wash/60"
        @click="choose(option.choice)"
      >
        <Icon :name="option.icon" class="size-5 shrink-0 text-accent" />
        <span class="flex min-w-0 flex-col">
          <span class="font-semibold">{{ option.label }}</span>
          <span class="truncate text-sm text-muted">{{ option.detail }}</span>
        </span>
      </button>
    </div>
    <label v-if="remaining > 0" class="flex items-center gap-2.5 text-sm">
      <input v-model="applyToRest" type="checkbox" class="size-4 accent-(--verdigris)" />
      Do the same for the {{ remaining }} other {{ remaining === 1 ? 'file' : 'files' }} with taken names
    </label>
  </UiDialog>
</template>
