<!-- A folder previews what's inside it: up to three thumbnails, or a quiet folder icon. -->
<script setup lang="ts">
const props = defineProps<{ ids: string[] }>()
const src = (id: string) => `/api/files/${id}/thumbnail`
</script>

<template>
  <div v-if="props.ids.length === 0" class="grid aspect-[16/9] place-items-center rounded-tile bg-sunken text-faint">
    <Icon name="lucide:folder" class="size-9" />
  </div>
  <div
    v-else
    class="grid aspect-[16/9] gap-1 overflow-hidden rounded-tile bg-sunken"
    :class="
      props.ids.length === 1
        ? 'grid-cols-1'
        : props.ids.length === 2
          ? 'grid-cols-2'
          : 'grid-cols-[2fr_1fr] grid-rows-2'
    "
  >
    <img
      v-for="(id, i) in props.ids"
      :key="id"
      :src="src(id)"
      alt=""
      loading="lazy"
      class="size-full object-cover"
      :class="props.ids.length === 3 && i === 0 ? 'row-span-2' : ''"
    />
  </div>
</template>
