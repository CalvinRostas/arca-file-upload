<script setup lang="ts">
const model = defineModel<string>({ default: '' })
const props = withDefaults(
  defineProps<{
    label: string
    type?: string
    hint?: string
    error?: string
    autocomplete?: string
    required?: boolean
    inputmode?: 'text' | 'numeric' | 'email'
    autofocus?: boolean
    min?: string
  }>(),
  {
    type: 'text',
    hint: undefined,
    error: undefined,
    autocomplete: undefined,
    required: false,
    inputmode: undefined,
    autofocus: false,
    min: undefined,
  },
)

const id = useId()
const revealed = ref(false)
const inputType = computed(() => (props.type === 'password' && revealed.value ? 'text' : props.type))
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-semibold">{{ props.label }}</label>
    <div
      class="flex h-10 items-center rounded-control border bg-surface focus-within:border-accent"
      :class="props.error ? 'border-danger' : 'border-line'"
    >
      <input
        :id="id"
        v-model="model"
        :type="inputType"
        :autocomplete="props.autocomplete"
        :required="props.required"
        :inputmode="props.inputmode"
        :autofocus="props.autofocus"
        :min="props.min"
        :aria-invalid="!!props.error || undefined"
        :aria-describedby="props.error || props.hint ? `${id}-desc` : undefined"
        class="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
      />
      <button
        v-if="props.type === 'password'"
        type="button"
        class="mr-1 grid size-8 place-items-center rounded-[0.5rem] text-faint hover:text-ink"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        @click="revealed = !revealed"
      >
        <Icon :name="revealed ? 'lucide:eye-off' : 'lucide:eye'" class="size-4" />
      </button>
    </div>
    <p v-if="props.error" :id="`${id}-desc`" class="text-sm text-danger">{{ props.error }}</p>
    <p v-else-if="props.hint" :id="`${id}-desc`" class="text-sm text-muted">{{ props.hint }}</p>
  </div>
</template>
