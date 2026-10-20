<script setup lang="ts">
import { TAG_COLORS, type Tag, type TagColor } from '~/types/library'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()
const { tags, refresh } = useTags()
const error = ref('')
const confirmingDelete = ref<string | null>(null)

// ── New tag ─────────────────────────────────────────────────────────────────

const newName = ref('')
const newColor = ref<TagColor>('sage')
const creating = ref(false)
watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  newName.value = ''
  newColor.value = nextTagColor(tags.value)
})

async function create() {
  error.value = ''
  creating.value = true
  try {
    const created = await $fetch('/api/tags', { method: 'POST', body: { name: newName.value, color: newColor.value } })
    newName.value = ''
    newColor.value = nextTagColor([...tags.value, created])
    await refresh()
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    creating.value = false
  }
}

async function save(tag: Tag, changes: { name?: string; color?: string }) {
  error.value = ''
  if (changes.name !== undefined && changes.name.trim() === tag.name) return
  try {
    await $fetch(`/api/tags/${tag.id}`, { method: 'PATCH', body: changes })
    await refresh()
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
    await refresh()
  }
}

async function remove(tag: Tag) {
  if (confirmingDelete.value !== tag.id) {
    confirmingDelete.value = tag.id
    return
  }
  confirmingDelete.value = null
  await $fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
  await refresh()
  emit('changed')
}
</script>

<template>
  <UiDialog
    v-model:open="open"
    title="Tags"
    description="Renaming or recolouring a tag changes it on every file. Deleting a tag keeps the files."
  >
    <form class="flex flex-col gap-2 rounded-tile border border-line bg-sunken/50 p-3" @submit.prevent="create">
      <div class="flex items-center gap-2">
        <input
          v-model="newName"
          aria-label="New tag name"
          placeholder="New tag"
          maxlength="40"
          class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 outline-none placeholder:text-faint focus:border-accent"
          autofocus
        />
        <UiButton
          type="submit"
          size="sm"
          variant="primary"
          icon="lucide:plus"
          :loading="creating"
          :disabled="!newName.trim()"
        >
          Add
        </UiButton>
      </div>
      <div class="flex gap-1.5" role="radiogroup" aria-label="Colour of the new tag">
        <button
          v-for="c in TAG_COLORS"
          :key="c"
          type="button"
          role="radio"
          :aria-checked="newColor === c"
          :aria-label="c"
          class="size-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow"
          :class="newColor === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line'"
          :style="{ background: tagColor(c) }"
          @click="newColor = c"
        />
      </div>
    </form>
    <UiAlert v-if="error">{{ error }}</UiAlert>
    <ul v-if="tags.length" class="flex max-h-[60dvh] flex-col gap-3 overflow-y-auto">
      <li v-for="t in tags" :key="t.id" class="flex flex-col gap-2 rounded-tile border border-line p-3">
        <div class="flex items-center gap-2">
          <input
            :value="t.name"
            :aria-label="`Name of tag ${t.name}`"
            class="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 outline-none focus:border-accent"
            @change="save(t, { name: ($event.target as HTMLInputElement).value })"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <UiButton v-if="confirmingDelete === t.id" size="sm" variant="danger" @click="remove(t)">
            {{ t.fileCount ? `Delete from ${t.fileCount} ${t.fileCount === 1 ? 'file' : 'files'}?` : 'Delete?' }}
          </UiButton>
          <UiButton
            v-else
            size="sm"
            variant="ghost"
            icon="lucide:trash-2"
            :aria-label="`Delete tag ${t.name}`"
            @click="remove(t)"
          />
        </div>
        <div class="flex gap-1.5" role="radiogroup" :aria-label="`Colour of tag ${t.name}`">
          <button
            v-for="c in TAG_COLORS"
            :key="c"
            type="button"
            role="radio"
            :aria-checked="t.color === c"
            :aria-label="c"
            class="size-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow"
            :class="t.color === c ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line'"
            :style="{ background: tagColor(c) }"
            @click="save(t, { color: c })"
          />
        </div>
      </li>
    </ul>
    <p v-else class="text-muted">No tags yet. Add one above, or from a file’s menu.</p>
    <div class="flex justify-end">
      <UiButton variant="primary" @click="open = false">Done</UiButton>
    </div>
  </UiDialog>
</template>
