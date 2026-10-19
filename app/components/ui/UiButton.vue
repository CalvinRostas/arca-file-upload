<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'md' | 'sm'
    type?: 'button' | 'submit'
    loading?: boolean
    disabled?: boolean
    icon?: string
  }>(),
  { variant: 'secondary', size: 'md', type: 'button', loading: false, disabled: false, icon: undefined },
)

const variants = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'bg-danger-wash text-danger hover:brightness-95 dark:hover:brightness-110',
}
const sizes = { md: 'h-10 px-4 gap-2', sm: 'h-8 px-3 gap-1.5 text-sm' }
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled || props.loading"
    :aria-busy="props.loading || undefined"
    class="inline-flex shrink-0 items-center justify-center rounded-control font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55"
    :class="[variants[props.variant], sizes[props.size]]"
  >
    <Icon v-if="props.loading" name="lucide:loader-circle" class="size-4 animate-spin" />
    <Icon v-else-if="props.icon" :name="props.icon" class="size-4" />
    <slot />
  </button>
</template>
