<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { ShareLink } from '~/types/library'

useHead({ title: 'Shared · Arca' })

const { data: links, refresh } = await useFetch<ShareLink[]>('/api/shares', { default: () => [] })
watch(useUploads().libraryVersion, () => refresh())
const toasts = useToasts()
const { copy } = useClipboard({ legacy: true })

async function copyLink(link: ShareLink) {
  await copy(shareUrl(link.token))
  toasts.show({ icon: 'lucide:check', message: `Copied the link to “${link.item.name}”` })
}

/** Where the Item lives in the Library; Files open in the viewer there. */
function libraryLink(link: ShareLink): string | undefined {
  if (!link.item.path) return undefined
  if (link.item.kind === 'folder') return `/folders/${link.itemId}`
  const parent = link.item.path.at(-1)
  return `${parent ? `/folders/${parent.id}` : '/'}?open=${link.itemId}`
}
const where = (link: ShareLink) => (link.item.path ? ['Library', ...link.item.path.map((c) => c.name)].join(' / ') : '')

const editing = ref(false)
const editItem = ref<{ id: string; name: string; kind: 'folder' | 'file' } | null>(null)
function edit(link: ShareLink) {
  editItem.value = { id: link.itemId, name: link.item.name, kind: link.item.kind }
  editing.value = true
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="min-w-0">
      <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Shared</h1>
      <p class="text-muted">Links to your files and folders. Anyone with a link can open it.</p>
    </div>

    <div
      v-if="links.length === 0"
      class="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line px-6 py-20 text-center"
    >
      <Icon name="lucide:link" class="size-12 text-faint" />
      <h2 class="text-lg font-semibold">Nothing shared yet</h2>
      <p class="max-w-sm text-muted">Choose Share… in a file’s or folder’s menu to get a link you can send.</p>
    </div>

    <ul v-else aria-label="Share links" class="overflow-hidden rounded-panel border border-line bg-surface">
      <li
        v-for="link in links"
        :key="link.id"
        class="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 hover:bg-sunken/60 sm:grid-cols-[1fr_auto_auto]"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[0.5rem] bg-sunken text-muted">
            <img
              v-if="link.item.thumbnail"
              :src="`/api/files/${link.itemId}/thumbnail`"
              alt=""
              loading="lazy"
              class="size-full object-cover"
            />
            <Icon
              v-else
              :name="link.item.kind === 'folder' ? 'lucide:folder' : fileIcon(link.item.name, link.item.mimeType)"
              class="size-4.5"
            />
          </span>
          <span class="flex min-w-0 flex-col">
            <NuxtLink
              v-if="libraryLink(link)"
              :to="libraryLink(link)"
              class="truncate font-semibold hover:text-accent-strong"
            >
              {{ link.item.name }}
            </NuxtLink>
            <span v-else class="truncate font-semibold">{{ link.item.name }}</span>
            <span class="truncate text-sm text-faint">
              <template v-if="link.status === 'active'">{{ shareSettingsLabel(link) }}</template>
              <span v-else class="font-semibold text-danger">{{ shareStatusLabel[link.status] }}</span>
              <template v-if="where(link)"> · in {{ where(link) }}</template>
            </span>
          </span>
        </div>
        <span class="hidden text-right text-sm whitespace-nowrap text-muted sm:block">{{
          shareActivityLabel(link)
        }}</span>
        <div class="flex items-center gap-1">
          <UiButton
            size="sm"
            icon="lucide:copy"
            :aria-label="`Copy link to ${link.item.name}`"
            :disabled="link.status !== 'active'"
            @click="copyLink(link)"
          >
            <span class="hidden md:inline">Copy link</span>
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            icon="lucide:settings-2"
            :aria-label="`Edit link to ${link.item.name}`"
            @click="edit(link)"
          />
        </div>
      </li>
    </ul>

    <ShareDialog v-model:open="editing" :item="editItem" @changed="refresh()" />
  </div>
</template>
