<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

const props = defineProps<{ files: LibraryItem[] }>()
/** Index into `files` of the open File, or null when closed. */
const index = defineModel<number | null>('index', { default: null })

const open = computed({
  get: () => index.value !== null,
  set: (value) => {
    if (!value) index.value = null
  },
})
const file = computed(() => (index.value === null ? null : (props.files[index.value] ?? null)))
const kind = computed(() => (file.value ? viewerKind(file.value) : 'none'))
const content = computed(() => (file.value ? `/api/files/${file.value.id}/content` : ''))
const mediaFailed = ref(false)

// Text is fetched and shown as text; it is never rendered as HTML.
const text = ref<string | null>(null)
watch(
  file,
  async (current) => {
    mediaFailed.value = false
    text.value = null
    if (current && viewerKind(current) === 'text') {
      text.value = await $fetch<string>(`/api/files/${current.id}/content`, { responseType: 'text' }).catch(() => null)
    }
  },
  { immediate: true },
)

function step(delta: number) {
  if (index.value === null || props.files.length === 0) return
  index.value = (index.value + delta + props.files.length) % props.files.length
}

// Arrow keys flip through files, wherever focus is (video controls keep their own arrows).
function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest('video, audio')) return
  if (event.key === 'ArrowRight') step(1)
  if (event.key === 'ArrowLeft') step(-1)
}
watch(open, (isOpen) => {
  if (isOpen) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const navButton =
  'absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60'
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-[#0d1312]/95 backdrop-blur-md" />
      <DialogContent class="fixed inset-0 z-50 flex flex-col text-white outline-none" @open-auto-focus.prevent>
        <header v-if="file" class="flex items-center gap-3 px-4 py-3 sm:px-6">
          <div class="flex min-w-0 flex-1 flex-col">
            <DialogTitle class="truncate font-semibold">{{ file.name }}</DialogTitle>
            <DialogDescription class="text-sm text-white/60">
              {{ formatBytes(file.size ?? 0) }}
              <template v-if="props.files.length > 1">
                <span aria-hidden="true">&ensp;</span>{{ (index ?? 0) + 1 }} of {{ props.files.length }}
              </template>
            </DialogDescription>
          </div>
          <a
            :href="content"
            download
            class="flex h-9 items-center gap-2 rounded-control bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"
          >
            <Icon name="lucide:download" class="size-4" /> Download
          </a>
          <DialogClose class="grid size-9 place-items-center rounded-full hover:bg-white/15" aria-label="Close">
            <Icon name="lucide:x" class="size-5" />
          </DialogClose>
        </header>

        <div v-if="file" class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-16">
          <button v-if="props.files.length > 1" :class="[navButton, 'left-3']" aria-label="Previous" @click="step(-1)">
            <Icon name="lucide:chevron-left" class="size-5" />
          </button>

          <img
            v-if="kind === 'image' || kind === 'thumbnail'"
            :key="file.id"
            :src="kind === 'image' ? `${content}?inline=1` : `/api/files/${file.id}/thumbnail`"
            :alt="file.name"
            class="max-h-full max-w-full rounded-tile object-contain"
          />
          <video
            v-else-if="kind === 'video' && !mediaFailed"
            :key="file.id"
            :src="`${content}?inline=1`"
            controls
            autoplay
            class="max-h-full max-w-full rounded-tile"
            @error="mediaFailed = true"
          />
          <div v-else-if="kind === 'audio' && !mediaFailed" class="flex w-full max-w-md flex-col items-center gap-6">
            <Icon name="lucide:music" class="size-16 text-white/50" />
            <audio
              :key="file.id"
              :src="`${content}?inline=1`"
              controls
              autoplay
              class="w-full"
              @error="mediaFailed = true"
            />
          </div>
          <iframe
            v-else-if="kind === 'pdf'"
            :key="file.id"
            :src="`${content}?inline=1`"
            :title="file.name"
            class="size-full rounded-tile bg-white"
          />
          <pre
            v-else-if="kind === 'text' && text !== null"
            class="size-full overflow-auto rounded-tile bg-[#151c1b] p-5 text-sm leading-relaxed whitespace-pre-wrap text-white/90"
            >{{ text }}</pre>
          <div v-else class="flex max-w-sm flex-col items-center gap-4 text-center">
            <Icon :name="fileIcon(file.name, file.mimeType)" class="size-16 text-white/50" />
            <p class="text-lg font-semibold">
              {{ mediaFailed ? 'Your browser can’t play this file' : 'No preview for this kind of file' }}
            </p>
            <p class="text-white/60">Download it to open it with an app on your device.</p>
          </div>

          <button v-if="props.files.length > 1" :class="[navButton, 'right-3']" aria-label="Next" @click="step(1)">
            <Icon name="lucide:chevron-right" class="size-5" />
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
