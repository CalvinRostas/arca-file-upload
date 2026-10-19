<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import type { UploadTask } from '~/composables/useUploads'

const uploads = useUploads()
const collapsed = ref(false)
const reattachError = ref('')
const reattachInput = ref<HTMLInputElement>()
let reattachTarget: string | null = null

const visible = computed(() => uploads.tasks.value.length > 0)
const uploading = computed(() => uploads.active.value.length)
const interrupted = computed(() => uploads.tasks.value.filter((t) => t.status === 'interrupted').length)

const heading = computed(() => {
  if (uploading.value) return `Uploading ${uploading.value} ${uploading.value === 1 ? 'file' : 'files'}`
  if (interrupted.value) return `${interrupted.value} ${interrupted.value === 1 ? 'upload' : 'uploads'} interrupted`
  const failed = uploads.tasks.value.filter((t) => t.status === 'failed').length
  if (failed) return `${failed} ${failed === 1 ? 'upload' : 'uploads'} failed`
  return 'Uploads complete'
})

const summary = computed(() => {
  const { size, sent, rate } = uploads.totals.value
  if (!uploading.value) return ''
  const eta = formatEta(size - sent, rate)
  return `${formatBytes(sent)} of ${formatBytes(size)}${eta ? `, ${eta}` : ''}`
})

function statusLine(task: DeepReadonly<UploadTask>): string {
  switch (task.status) {
    case 'queued':
      return 'Waiting'
    case 'uploading': {
      const eta = formatEta(task.size - task.sent, task.bytesPerSecond)
      return `${formatBytes(task.sent)} of ${formatBytes(task.size)}${eta ? `, ${eta}` : ''}`
    }
    case 'paused':
      return `Paused at ${formatBytes(task.sent)} of ${formatBytes(task.size)}`
    case 'interrupted':
      return 'Interrupted. Select the file again to continue where it stopped.'
    case 'failed':
      return task.error ?? 'The upload failed.'
    case 'skipped':
      return `Skipped, already in ${task.folderName}`
    case 'done': {
      const result = task.result?.status === 'added' ? task.result : null
      if (result?.replaced) return `Replaced the file in ${task.folderName}`
      const where = task.relativeDir ? `${task.folderName}/${task.relativeDir}` : task.folderName
      return result && result.file.name !== task.name ? `Saved to ${where} as ${result.file.name}` : `Saved to ${where}`
    }
  }
}

function pickAgain(taskId: string) {
  reattachTarget = taskId
  reattachError.value = ''
  reattachInput.value?.click()
}

function onReattach(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !reattachTarget) return
  if (!uploads.reattach(reattachTarget, file)) {
    reattachError.value = 'That’s a different file. Pick the same one to resume.'
  }
}

// Leaving the page would interrupt running uploads; let the browser ask first.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (uploads.tasks.value.some((t) => t.status === 'uploading')) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const iconButton = 'grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink'
</script>

<template>
  <aside
    v-if="visible"
    aria-label="Uploads"
    class="pointer-events-auto flex max-h-[60dvh] flex-col rounded-panel border border-line bg-surface shadow-float"
  >
    <div class="flex items-center gap-2 px-4 pt-3.5 pb-3">
      <div class="flex min-w-0 flex-1 flex-col">
        <h2 class="truncate font-semibold">{{ heading }}</h2>
        <p v-if="summary" class="text-sm text-faint">{{ summary }}</p>
      </div>
      <button
        :class="iconButton"
        :aria-label="collapsed ? 'Show uploads' : 'Hide uploads'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <Icon :name="collapsed ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-4" />
      </button>
      <button
        v-if="!uploading"
        :class="iconButton"
        aria-label="Clear finished uploads"
        @click="uploads.clearFinished()"
      >
        <Icon name="lucide:x" class="size-4" />
      </button>
    </div>

    <div v-if="!collapsed" class="flex flex-col gap-3.5 overflow-y-auto border-t border-line px-4 py-3.5">
      <p v-if="reattachError" class="text-sm text-danger">{{ reattachError }}</p>
      <div v-for="task in uploads.tasks.value" :key="task.id" class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <Icon
            v-if="task.status === 'done' || task.status === 'skipped'"
            name="lucide:circle-check"
            class="size-4 shrink-0 text-accent"
          />
          <Icon
            v-else-if="task.status === 'failed' || task.status === 'interrupted'"
            name="lucide:circle-alert"
            class="size-4 shrink-0 text-danger"
          />
          <span class="min-w-0 flex-1 truncate font-semibold" :title="task.name">{{ task.name }}</span>
          <button
            v-if="task.status === 'uploading'"
            :class="iconButton"
            :aria-label="`Pause ${task.name}`"
            @click="uploads.pause(task.id)"
          >
            <Icon name="lucide:pause" class="size-3.5" />
          </button>
          <button
            v-if="task.status === 'paused' || task.status === 'failed'"
            :class="iconButton"
            :aria-label="`${task.status === 'failed' ? 'Retry' : 'Resume'} ${task.name}`"
            @click="uploads.resume(task.id)"
          >
            <Icon :name="task.status === 'failed' ? 'lucide:rotate-cw' : 'lucide:play'" class="size-3.5" />
          </button>
          <button
            v-if="task.status === 'interrupted'"
            class="shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold text-accent hover:bg-accent-wash"
            @click="pickAgain(task.id)"
          >
            Select file
          </button>
          <button
            v-if="!['done', 'skipped'].includes(task.status)"
            :class="iconButton"
            :aria-label="`Cancel ${task.name}`"
            @click="uploads.cancel(task.id)"
          >
            <Icon name="lucide:x" class="size-3.5" />
          </button>
        </div>
        <div
          v-if="['uploading', 'paused', 'queued', 'interrupted'].includes(task.status)"
          class="h-1.5 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          :aria-valuenow="Math.round((task.sent / Math.max(task.size, 1)) * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${task.name} progress`"
        >
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="task.status === 'uploading' ? 'bg-accent' : 'bg-faint'"
            :style="{ width: `${(task.sent / Math.max(task.size, 1)) * 100}%` }"
          />
        </div>
        <p class="text-sm" :class="task.status === 'failed' ? 'text-danger' : 'text-faint'">
          {{ statusLine(task) }}
        </p>
      </div>
    </div>
    <input ref="reattachInput" type="file" class="hidden" @change="onReattach" />
  </aside>
</template>
