<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Set up Arca' })

const session = useSession()
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch('/api/setup', { method: 'POST', body: form })
    await session.refresh()
    await navigateTo('/')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">Set up Arca</h1>
      <p class="text-muted">
        Create the admin account. You’ll use it to invite the other people who can store files here.
      </p>
    </div>
    <UiAlert v-if="error">{{ error }}</UiAlert>
    <div class="flex flex-col gap-4">
      <UiField v-model="form.name" label="Your name" autocomplete="name" required autofocus />
      <UiField v-model="form.email" label="Email" type="email" autocomplete="username" required />
      <UiField
        v-model="form.password"
        label="Password"
        type="password"
        autocomplete="new-password"
        hint="At least 10 characters. A few random words works well."
        required
      />
    </div>
    <UiButton type="submit" variant="primary" :loading="busy">Create admin account</UiButton>
  </form>
</template>
