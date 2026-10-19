<script setup lang="ts">
// Theme preview with mock data. Removed once the real Library screens exist.
definePageMeta({ layout: false })
useHead({ title: 'Theme preview · Arca' })

type Scene = { sky: string; sun: string; hills: [string, string]; variant: number }

const scenes: Record<string, Scene> = {
  dusk: { sky: '#e9c9b5', sun: '#f6e7d8', hills: ['#8f7d8c', '#5d5466'], variant: 0 },
  lake: { sky: '#bcd5df', sun: '#f2f4ea', hills: ['#6f9a8f', '#3f6b61'], variant: 1 },
  field: { sky: '#dfe5c8', sun: '#fbf6dc', hills: ['#a4ad6a', '#6f7a43'], variant: 2 },
  night: { sky: '#3a4a63', sun: '#d8dfe9', hills: ['#2b3850', '#1d2638'], variant: 3 },
  coast: { sky: '#cfe0e3', sun: '#fff8e8', hills: ['#c9b48d', '#5f8c95'], variant: 4 },
}

const tags = [
  { name: 'family', color: 'sage', count: 412 },
  { name: 'taxes', color: 'ochre', count: 23 },
  { name: 'travel', color: 'lake', count: 186 },
  { name: 'receipts', color: 'clay', count: 61 },
  { name: 'work', color: 'slate', count: 94 },
]

const folders = [
  { name: 'Photos 2024', items: '1,284 items', mosaic: ['lake', 'dusk', 'field'] },
  { name: 'Kyoto trip', items: '212 items', mosaic: ['night', 'coast', 'lake'] },
  { name: 'Taxes', items: '38 items', mosaic: [] },
  { name: 'Machine backups', items: '6 items', mosaic: [] },
]

const files = [
  { name: 'ronda-bridge.heic', size: '4.2 MB', date: 'Oct 14', scene: 'dusk', tags: ['travel', 'family'] },
  { name: 'lake-bled-morning.jpg', size: '6.8 MB', date: 'Oct 12', scene: 'lake', tags: ['travel'] },
  {
    name: 'macbook-backup-2026-10.dmg',
    size: '9.6 GB',
    date: 'Oct 11',
    icon: 'lucide:hard-drive',
    ext: 'dmg',
    tags: ['work'],
  },
  {
    name: 'Einkommensteuer 2025.pdf',
    size: '1.1 MB',
    date: 'Sep 30',
    icon: 'lucide:file-text',
    ext: 'pdf',
    tags: ['taxes'],
  },
  { name: 'grandma-80th.mp4', size: '2.3 GB', date: 'Sep 21', scene: 'field', video: '12:48', tags: ['family'] },
  { name: 'perseids.jpg', size: '3.9 MB', date: 'Aug 13', scene: 'night', tags: [] },
  { name: 'praia-da-marinha.jpg', size: '5.5 MB', date: 'Aug 2', scene: 'coast', tags: ['travel'] },
  { name: 'lease-agreement-signed.pdf', size: '640 KB', date: 'Jul 9', icon: 'lucide:file-text', ext: 'pdf', tags: [] },
]

const tagColor = (name: string) => `var(--tag-${tags.find((t) => t.name === name)?.color ?? 'slate'})`

const view = ref<'grid' | 'list'>('grid')
const selected = ref('lake-bled-morning.jpg')
</script>

<template>
  <div class="flex min-h-dvh bg-ground text-ink">
    <!-- Sidebar -->
    <aside class="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 px-4 py-5 lg:flex">
      <div class="flex items-center gap-2.5 px-2">
        <BrandMark class="size-7 text-ink" />
        <span class="text-lg font-bold tracking-tight">Arca</span>
      </div>

      <button
        class="flex items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 font-semibold text-on-accent transition-colors hover:bg-accent-strong"
      >
        <Icon name="lucide:upload" class="size-4" />
        Upload
      </button>

      <nav class="flex flex-col gap-0.5" aria-label="Main">
        <a
          href="#"
          aria-current="page"
          class="flex items-center gap-3 rounded-control bg-accent-wash px-3 py-2 font-semibold text-accent-strong"
        >
          <Icon name="lucide:library" class="size-4.5" /> Library
        </a>
        <a href="#" class="flex items-center gap-3 rounded-control px-3 py-2 text-muted hover:bg-sunken hover:text-ink">
          <Icon name="lucide:link-2" class="size-4.5" /> Shared
          <span class="ml-auto text-sm text-faint">7</span>
        </a>
        <a href="#" class="flex items-center gap-3 rounded-control px-3 py-2 text-muted hover:bg-sunken hover:text-ink">
          <Icon name="lucide:trash-2" class="size-4.5" /> Trash
        </a>
      </nav>

      <section class="flex flex-col gap-0.5">
        <h2 class="px-3 pb-1 text-sm font-semibold text-faint">Tags</h2>
        <a
          v-for="tag in tags"
          :key="tag.name"
          href="#"
          class="flex items-center gap-3 rounded-control px-3 py-1.5 text-muted hover:bg-sunken hover:text-ink"
        >
          <span class="size-2.5 rounded-full" :style="{ background: `var(--tag-${tag.color})` }" />
          {{ tag.name }}
          <span class="ml-auto text-sm text-faint">{{ tag.count }}</span>
        </a>
      </section>

      <div class="mt-auto flex flex-col gap-2 px-3">
        <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
          <div class="h-full w-[23%] rounded-full bg-accent" />
        </div>
        <p class="text-sm text-muted">412 GB of 1.8 TB disk used</p>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-10 flex items-center gap-3 bg-ground/85 px-4 py-3 backdrop-blur lg:px-8">
        <label
          class="flex h-10 max-w-xl flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 text-muted focus-within:border-accent"
        >
          <Icon name="lucide:search" class="size-4 shrink-0" />
          <input
            type="search"
            placeholder="Search files, tags, folders"
            class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
          />
          <kbd class="hidden rounded-md border border-line px-1.5 text-xs text-faint sm:block">⌘K</kbd>
        </label>
        <div class="ml-auto flex items-center gap-3">
          <ThemeSwitch />
          <span
            class="grid size-9 place-items-center rounded-full bg-accent-wash text-sm font-bold text-accent-strong"
            title="Ada Lovelace"
          >
            AL
          </span>
        </div>
      </header>

      <main class="flex flex-col gap-8 px-4 pt-4 pb-32 lg:px-8">
        <div class="flex flex-wrap items-end gap-4">
          <div>
            <nav class="mb-1 flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
              <a href="#" class="hover:text-ink">Library</a>
              <Icon name="lucide:chevron-right" class="size-3.5 text-faint" />
              <span>Travel</span>
            </nav>
            <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Summer 2026</h1>
          </div>

          <div class="ml-auto flex items-center gap-2">
            <button
              class="flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-muted hover:text-ink"
            >
              <Icon name="lucide:arrow-down-wide-narrow" class="size-4" /> Newest first
            </button>
            <ToggleGroupRoot
              v-model="view"
              type="single"
              aria-label="Layout"
              class="inline-flex rounded-control border border-line bg-surface p-0.5"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="Grid"
                class="grid size-8 place-items-center rounded-[0.5rem] text-muted data-[state=on]:bg-sunken data-[state=on]:text-ink"
              >
                <Icon name="lucide:layout-grid" class="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="List"
                class="grid size-8 place-items-center rounded-[0.5rem] text-muted data-[state=on]:bg-sunken data-[state=on]:text-ink"
              >
                <Icon name="lucide:list" class="size-4" />
              </ToggleGroupItem>
            </ToggleGroupRoot>
          </div>
        </div>

        <!-- Folders: each tile previews what's inside it. -->
        <section aria-labelledby="folders-h" class="flex flex-col gap-3">
          <h2 id="folders-h" class="text-base font-semibold text-muted">Folders</h2>
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            <a
              v-for="folder in folders"
              :key="folder.name"
              href="#"
              class="group flex flex-col gap-3 rounded-panel border border-line bg-surface p-2.5 transition-colors hover:border-accent/40"
            >
              <div
                v-if="folder.mosaic.length"
                class="grid aspect-[16/9] grid-cols-[2fr_1fr] grid-rows-2 gap-1 overflow-hidden rounded-tile"
              >
                <PhotoPlaceholder v-bind="scenes[folder.mosaic[0]!]!" class="row-span-2" />
                <PhotoPlaceholder v-bind="scenes[folder.mosaic[1]!]!" />
                <PhotoPlaceholder v-bind="scenes[folder.mosaic[2]!]!" />
              </div>
              <div v-else class="grid aspect-[16/9] place-items-center rounded-tile bg-sunken text-faint">
                <Icon name="lucide:folder" class="size-9" />
              </div>
              <div class="flex items-baseline justify-between gap-2 px-1.5 pb-1">
                <span class="truncate font-semibold">{{ folder.name }}</span>
                <span class="shrink-0 text-sm text-faint">{{ folder.items }}</span>
              </div>
            </a>
          </div>
        </section>

        <section aria-labelledby="files-h" class="flex flex-col gap-3">
          <h2 id="files-h" class="text-base font-semibold text-muted">Files</h2>
          <div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <button
              v-for="file in files"
              :key="file.name"
              class="group flex flex-col gap-2 text-left"
              :aria-pressed="selected === file.name"
              @click="selected = file.name"
            >
              <div
                class="relative aspect-[4/3] overflow-hidden rounded-tile ring-2 ring-transparent ring-offset-2 ring-offset-ground transition-shadow"
                :class="selected === file.name ? 'ring-accent!' : 'group-hover:ring-line'"
              >
                <PhotoPlaceholder v-if="file.scene" v-bind="scenes[file.scene]!" />
                <div v-else class="flex size-full flex-col items-center justify-center gap-1.5 bg-sunken text-muted">
                  <Icon :name="file.icon!" class="size-8" />
                  <span class="text-sm">{{ file.ext }}</span>
                </div>
                <span
                  v-if="file.video"
                  class="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white"
                >
                  <Icon name="lucide:play" class="size-3" /> {{ file.video }}
                </span>
              </div>
              <div class="flex flex-col gap-0.5 px-1">
                <span class="truncate font-semibold">{{ file.name }}</span>
                <span class="flex items-center gap-2 text-sm text-faint">
                  {{ file.size }}
                  <span class="ml-auto flex items-center gap-1">
                    <span
                      v-for="tag in file.tags"
                      :key="tag"
                      class="size-2 rounded-full"
                      :style="{ background: tagColor(tag) }"
                      :title="tag"
                    />
                  </span>
                  <span>{{ file.date }}</span>
                </span>
              </div>
            </button>
          </div>
        </section>

        <!-- Reference for controls and states -->
        <section
          aria-labelledby="states-h"
          class="mt-6 flex flex-col gap-5 rounded-panel border border-dashed border-line p-6"
        >
          <h2 id="states-h" class="text-base font-semibold text-muted">Controls and states</h2>
          <div class="flex flex-wrap items-center gap-3">
            <button class="rounded-control bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong">
              Create share link
            </button>
            <button class="rounded-control border border-line bg-surface px-4 py-2 font-semibold hover:bg-sunken">
              Move to folder
            </button>
            <button class="rounded-control px-4 py-2 font-semibold text-muted hover:bg-sunken hover:text-ink">
              Cancel
            </button>
            <button class="rounded-control bg-danger-wash px-4 py-2 font-semibold text-danger">Delete forever</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-for="tag in tags"
              :key="tag.name"
              class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-2 text-sm"
            >
              <span class="size-2 rounded-full" :style="{ background: `var(--tag-${tag.color})` }" />
              {{ tag.name }}
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-0.5 text-sm text-accent-strong"
            >
              type:pdf
              <Icon name="lucide:x" class="size-3" />
            </span>
          </div>
          <label class="flex max-w-sm flex-col gap-1.5">
            <span class="text-sm font-semibold">Link password</span>
            <input
              type="password"
              value="hunter22hunter"
              class="h-10 rounded-control border border-line bg-surface px-3 outline-none focus:border-accent"
            />
            <span class="text-sm text-muted">People with the link need this to open it.</span>
          </label>
        </section>
      </main>
    </div>

    <!-- Duplicate notice -->
    <div
      role="status"
      class="fixed bottom-6 left-1/2 z-20 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-panel border border-line bg-surface p-3 pl-4 shadow-float lg:left-[calc(50%+8rem)]"
    >
      <Icon name="lucide:copy" class="size-4.5 shrink-0 text-accent" />
      <p class="min-w-0 flex-1 text-sm">
        You already have <strong class="font-semibold">perseids.jpg</strong> in Photos 2024.
      </p>
      <button class="shrink-0 rounded-control px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sunken">
        Keep
      </button>
      <button class="shrink-0 rounded-control bg-sunken px-3 py-1.5 text-sm font-semibold hover:bg-line">
        Discard this copy
      </button>
    </div>

    <!-- Upload queue -->
    <aside
      aria-label="Uploads"
      class="fixed right-6 bottom-24 z-20 hidden w-80 flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-float md:flex"
    >
      <div class="flex items-center">
        <h2 class="font-semibold">Uploading 2 files</h2>
        <button
          class="ml-auto grid size-7 place-items-center rounded-full text-muted hover:bg-sunken"
          aria-label="Collapse"
        >
          <Icon name="lucide:chevron-down" class="size-4" />
        </button>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <span class="truncate font-semibold">macbook-backup-2026-10.dmg</span>
          <button
            class="ml-auto grid size-6 place-items-center rounded-full text-muted hover:bg-sunken"
            aria-label="Pause"
          >
            <Icon name="lucide:pause" class="size-3.5" />
          </button>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-sunken">
          <div class="h-full w-[62%] rounded-full bg-accent" />
        </div>
        <p class="text-sm text-faint">5.9 of 9.6 GB, about 4 min left</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-sm">
          <span class="truncate font-semibold">grandma-80th.mp4</span>
          <span class="ml-auto text-faint">Waiting</span>
        </div>
        <div class="h-1.5 rounded-full bg-sunken" />
      </div>
    </aside>
  </div>
</template>
