<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import type { DuplicateNotice } from '~/composables/useDuplicateNotices'

const { notices, dismiss } = useDuplicateNotices()
const uploads = useUploads()
const busy = ref<string | null>(null)
const failed = ref<string | null>(null)

async function discard(notice: DeepReadonly<DuplicateNotice>) {
  busy.value = notice.id
  failed.value = null
  try {
    for (const id of notice.fileIds) await $fetch(`/api/files/${id}/duplicate`, { method: 'DELETE' })
    dismiss(notice.id)
    uploads.touchLibrary()
  } catch {
    failed.value = notice.id
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div v-if="notices.length" class="flex flex-col gap-2">
    <div
      v-for="notice in notices"
      :key="notice.id"
      role="status"
      class="pointer-events-auto flex flex-col gap-2.5 rounded-panel border border-line bg-surface p-3.5 pl-4 shadow-float"
    >
      <div class="flex gap-3">
        <Icon name="lucide:copy" class="mt-0.5 size-4.5 shrink-0 text-accent" />
        <p class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
          <template v-if="notice.single && notice.single.name === notice.single.originalName">
            You already have <strong class="font-semibold">{{ notice.single.name }}</strong> in
            {{ notice.single.folder }}.
          </template>
          <template v-else-if="notice.single">
            <strong class="font-semibold">{{ notice.single.name }}</strong> is the same as
            <strong class="font-semibold">{{ notice.single.originalName }}</strong> in {{ notice.single.folder }}.
          </template>
          <template v-else>
            {{ notice.fileIds.length }} of the files you just uploaded were already in your library.
          </template>
          <span v-if="failed === notice.id" class="block text-danger">Couldn’t discard. Try again.</span>
        </p>
      </div>
      <div class="flex justify-end gap-1">
        <UiButton size="sm" variant="ghost" @click="dismiss(notice.id)">
          {{ notice.single ? 'Keep' : 'Keep all' }}
        </UiButton>
        <UiButton size="sm" :loading="busy === notice.id" @click="discard(notice)">
          {{ notice.single ? 'Discard this copy' : 'Discard copies' }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
