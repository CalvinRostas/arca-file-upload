<script setup lang="ts">
const { tags, refresh } = useTags()
const route = useRoute()
const managing = ref(false)
const uploads = useUploads()

const queryFor = (name: string) => `tag:${/\s/.test(name) ? `"${name}"` : name}`
const isActive = (name: string) => route.path === '/search' && route.query.q === queryFor(name)
</script>

<template>
  <section class="flex flex-col gap-0.5" aria-labelledby="tags-h">
    <div class="flex items-center justify-between px-3 pb-1">
      <h2 id="tags-h" class="text-sm font-semibold text-faint">Tags</h2>
      <button
        v-if="tags.length"
        type="button"
        class="grid size-6 place-items-center rounded-full text-faint hover:bg-sunken hover:text-ink"
        aria-label="Edit tags"
        @click="managing = true"
      >
        <Icon name="lucide:pencil" class="size-3.5" />
      </button>
    </div>
    <NuxtLink
      v-for="t in tags"
      :key="t.id"
      :to="{ path: '/search', query: { q: queryFor(t.name) } }"
      class="flex items-center gap-3 rounded-control px-3 py-1.5"
      :class="
        isActive(t.name)
          ? 'bg-accent-wash font-semibold text-accent-strong'
          : 'text-muted hover:bg-sunken hover:text-ink'
      "
    >
      <span class="size-2.5 shrink-0 rounded-full" :style="{ background: tagColor(t.color) }" />
      <span class="flex-1 truncate">{{ t.name }}</span>
      <span class="text-sm text-faint">{{ t.fileCount }}</span>
    </NuxtLink>
    <p v-if="!tags.length" class="px-3 text-sm text-faint">Tag files from their menu to find them here.</p>
    <TagManager v-model:open="managing" @changed="refresh().then(() => uploads.touchLibrary())" />
  </section>
</template>
