<script setup lang="ts">
import type { SharedItem, SharedListing, SharedRoot } from '~/types/library'

// A Share link, as anyone holding it sees it: one File, or a Folder to browse.
definePageMeta({ layout: 'visitor' })

const route = useRoute()
const token = route.params.token as string
const urls = provideSharedFileUrls(token)
const folderId = computed(() => (typeof route.query.folder === 'string' ? route.query.folder : null))
const requestFetch = useRequestFetch()

const { data: root, error, refresh } = await useFetch<SharedRoot>(`/api/s/${token}`)
const locked = computed(() => apiErrorCode(error.value) === 'password_required')
const isFolder = computed(() => root.value?.item.kind === 'folder')

const { data: listing, error: listingError } = await useAsyncData(
  `share-${token}-listing`,
  () =>
    isFolder.value
      ? requestFetch<SharedListing>(`/api/s/${token}/items`, { query: { folder: folderId.value ?? undefined } })
      : Promise.resolve(null),
  { watch: [folderId, isFolder] },
)

/** Expired, used up, or gone (the server says which); a sub-Folder that left the share is "gone" too. */
const unavailable = computed(() => {
  const failure = error.value ?? listingError.value
  if (!failure) return null
  return apiErrorCode(failure)?.startsWith('share_') ? apiErrorMessage(failure) : 'This link isn’t available'
})

const title = computed(() => listing.value?.folder.name ?? root.value?.item.name ?? 'Shared with you')
useHead({ title: computed(() => `${title.value} · Arca`) })

const sharedBy = computed(() => {
  if (!root.value) return ''
  const expiry = root.value.expiresAt ? ` · Link works until ${formatDate(root.value.expiresAt)}` : ''
  return `Shared by ${root.value.ownerName}${expiry}`
})

// ── Password ────────────────────────────────────────────────────────────────

const password = ref('')
const unlockError = ref('')
const unlocking = ref(false)
async function unlock() {
  unlockError.value = ''
  unlocking.value = true
  try {
    await $fetch(`/api/s/${token}/unlock`, { method: 'POST', body: { password: password.value } })
    await refresh()
  } catch (e) {
    unlockError.value = apiErrorMessage(e)
  } finally {
    unlocking.value = false
  }
}

// ── Browsing ────────────────────────────────────────────────────────────────

const files = computed<SharedItem[]>(() =>
  isFolder.value ? (listing.value?.items.filter((i) => i.kind === 'file') ?? []) : root.value ? [root.value.item] : [],
)
const folders = computed(() => listing.value?.items.filter((i) => i.kind === 'folder') ?? [])
const viewerIndex = ref<number | null>(null)

function open(item: SharedItem) {
  if (item.kind === 'folder') return navigateTo({ query: { folder: item.id } })
  viewerIndex.value = files.value.findIndex((f) => f.id === item.id)
}
const crumbs = computed(() =>
  (listing.value?.path ?? []).map((c, i) => ({ label: c.name, to: { query: i === 0 ? {} : { folder: c.id } } })),
)
const zipHref = computed(() => `/api/s/${token}/zip${folderId.value ? `?ids=${folderId.value}` : ''}`)
</script>

<template>
  <div>
    <!-- Password first: nothing about what's shared shows before it. -->
    <div v-if="locked" class="mx-auto flex max-w-sm flex-col gap-6 pt-[8vh]">
      <div class="flex flex-col gap-2">
        <Icon name="lucide:lock-keyhole" class="size-9 text-accent" />
        <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">This link is protected</h1>
        <p class="text-muted">Enter the password you were given to see what’s shared.</p>
      </div>
      <form class="flex flex-col gap-4" @submit.prevent="unlock">
        <UiField
          v-model="password"
          type="password"
          label="Password"
          autocomplete="current-password"
          :error="unlockError"
          required
          autofocus
        />
        <UiButton type="submit" variant="primary" :loading="unlocking">Open</UiButton>
      </form>
    </div>

    <div v-else-if="unavailable" class="mx-auto flex max-w-sm flex-col gap-3 pt-[8vh]">
      <Icon name="lucide:link-2-off" class="size-9 text-faint" />
      <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">{{ unavailable }}</h1>
      <p class="text-muted">If you still need it, ask the person who shared it for a new link.</p>
    </div>

    <!-- One File: a card to preview or download it. -->
    <div v-else-if="root && !isFolder" class="mx-auto flex max-w-xl flex-col items-center gap-6 pt-[4vh] text-center">
      <button
        type="button"
        class="grid aspect-[4/3] w-full max-w-md place-items-center overflow-hidden rounded-panel border border-line bg-sunken text-muted"
        :aria-label="`Open ${root.item.name}`"
        @click="viewerIndex = 0"
      >
        <img v-if="root.item.thumbnail" :src="urls.thumbnail(root.item.id)" alt="" class="size-full object-contain" />
        <Icon v-else :name="fileIcon(root.item.name, root.item.mimeType)" class="size-14" />
      </button>
      <div class="flex min-w-0 flex-col gap-1">
        <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight break-all">{{ root.item.name }}</h1>
        <p class="text-muted">{{ formatBytes(root.item.size ?? 0) }} · {{ sharedBy }}</p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <UiButton icon="lucide:eye" @click="viewerIndex = 0">{{ root.previews ? 'Preview' : 'Open' }}</UiButton>
        <a
          :href="urls.content(root.item.id)"
          download
          class="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 font-semibold text-on-accent hover:bg-accent-strong"
        >
          <Icon name="lucide:download" class="size-4" /> Download
        </a>
      </div>
    </div>

    <!-- A Folder: browse it, open Files, download everything as a zip. -->
    <div v-else-if="root && listing" class="flex flex-col gap-8">
      <div class="flex flex-wrap items-end gap-4">
        <div class="min-w-0">
          <UiBreadcrumb v-if="crumbs.length > 1" :crumbs="crumbs" root-icon="lucide:folder" class="mb-3" />
          <h1 class="truncate text-[2rem] leading-tight font-bold tracking-tight">{{ listing.folder.name }}</h1>
          <p class="text-muted">{{ sharedBy }}</p>
        </div>
        <a
          v-if="listing.items.length"
          :href="zipHref"
          download
          class="ml-auto inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 font-semibold text-on-accent hover:bg-accent-strong"
        >
          <Icon name="lucide:download" class="size-4" /> Download all
        </a>
      </div>

      <div
        v-if="listing.items.length === 0"
        class="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-20 text-center"
      >
        <Icon name="lucide:folder-open" class="size-12 text-faint" />
        <h2 class="text-lg font-semibold">This folder is empty</h2>
      </div>

      <section v-if="folders.length" aria-labelledby="folders-h" class="flex flex-col gap-3">
        <h2 id="folders-h" class="text-base font-semibold text-muted">Folders</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <SharedTile v-for="folder in folders" :key="folder.id" :item="folder" @open="open(folder)" />
        </div>
      </section>
      <section v-if="files.length" aria-labelledby="files-h" class="flex flex-col gap-3">
        <h2 id="files-h" class="text-base font-semibold text-muted">Files</h2>
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          <SharedTile v-for="file in files" :key="file.id" :item="file" @open="open(file)" />
        </div>
      </section>
    </div>

    <FileViewer v-if="root" v-model:index="viewerIndex" :files="files" :previews="root.previews" />
  </div>
</template>
