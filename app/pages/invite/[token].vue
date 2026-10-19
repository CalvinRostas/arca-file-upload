<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Join Arca' })

const route = useRoute()
const session = useSession()
const token = route.params.token as string

const { data: status } = await useFetch(`/api/invites/redeem/${token}`)

const form = reactive({ name: '', email: '', password: '' })
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await $fetch(`/api/invites/redeem/${token}`, { method: 'POST', body: form })
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
  <div v-if="session.user.value" class="flex flex-col gap-4">
    <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">You’re already signed in</h1>
    <p class="text-muted">
      This invite is for someone new. To use it yourself with a different account, sign out first.
    </p>
    <div class="flex gap-3">
      <UiButton variant="primary" @click="navigateTo('/')">Go to your library</UiButton>
      <UiButton variant="ghost" @click="session.signOut()">Sign out</UiButton>
    </div>
  </div>

  <div v-else-if="!status?.redeemable" class="flex flex-col gap-4">
    <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">This invite link doesn’t work</h1>
    <p class="text-muted">
      It has expired, was revoked, or someone already used it. Ask the person who sent it for a new link.
    </p>
    <NuxtLink to="/login" class="text-sm font-semibold text-accent hover:underline">I already have an account</NuxtLink>
  </div>

  <form v-else class="flex flex-col gap-6" @submit.prevent="submit">
    <div class="flex flex-col gap-2">
      <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">Join Arca</h1>
      <p class="text-muted">
        You’ve been invited to back up and share files here. Your files are private to you unless you share them.
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
    <UiButton type="submit" variant="primary" :loading="busy">Create account</UiButton>
  </form>
</template>
