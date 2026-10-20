<script setup lang="ts">
import type { SharedItem } from '~/types/library'

const props = withDefaults(
  defineProps<{
    files: SharedItem[]
    /** Off for Share links with a download limit: only thumbnails, and a Download button. */
    previews?: boolean
  }>(),
  { previews: true },
)
const urls = useFileUrls()
/** Index into `files` of the open File, or null when closed. */
const index = defineModel<number | null>('index', { default: null })

const open = computed({
  get: () => index.value !== null,
  set: (value) => {
    if (!value) index.value = null
  },
})
const file = computed(() => (index.value === null ? null : (props.files[index.value] ?? null)))
const kindOf = (item: SharedItem) => (props.previews ? viewerKind(item) : item.thumbnail ? 'thumbnail' : 'none')
const kind = computed(() => (file.value ? kindOf(file.value) : 'none'))
const download = computed(() => (file.value ? urls.content(file.value.id) : ''))
const preview = computed(() => (file.value ? urls.preview(file.value.id) : ''))
const mediaFailed = ref(false)

// Text is fetched and shown as text; it is never rendered as HTML.
const text = ref<string | null>(null)
watch(
  file,
  async (current) => {
    mediaFailed.value = false
    text.value = null
    if (current && kindOf(current) === 'text') {
      text.value = await $fetch<string>(urls.preview(current.id), { responseType: 'text' }).catch(() => null)
    }
  },
  { immediate: true },
)

/** No large copy (formats browsers show natively don't get one): fall back to the thumbnail. */
function onImageError(event: Event, id: string) {
  const img = event.target as HTMLImageElement
  const fallback = urls.thumbnail(id)
  if (kind.value === 'thumbnail' && !img.src.endsWith(fallback)) img.src = fallback
}

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
            :href="download"
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
            :src="kind === 'image' ? preview : urls.thumbnail(file.id, 'view')"
            :alt="file.name"
            class="max-h-full max-w-full rounded-tile object-contain"
            @error="onImageError($event, file.id)"
          />
          <video
            v-else-if="kind === 'video' && !mediaFailed"
            :key="file.id"
            :src="preview"
            controls
            autoplay
            class="max-h-full max-w-full rounded-tile"
            @error="mediaFailed = true"
          />
          <div v-else-if="kind === 'audio' && !mediaFailed" class="flex w-full max-w-md flex-col items-center gap-6">
            <Icon name="lucide:music" class="size-16 text-white/50" />
            <audio :key="file.id" :src="preview" controls autoplay class="w-full" @error="mediaFailed = true" />
          </div>
          <iframe
            v-else-if="kind === 'pdf'"
            :key="file.id"
            :src="preview"
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
              {{
                mediaFailed
                  ? 'Your browser can’t play this file'
                  : props.previews
                    ? 'No preview for this kind of file'
                    : 'Previews are off for this link'
              }}
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
