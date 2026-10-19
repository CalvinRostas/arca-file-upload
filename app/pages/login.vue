<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Sign in · Arca' })

const route = useRoute()
const session = useSession()

const step = ref<'password' | 'code'>('password')
const useBackupCode = ref(false)
const email = ref('')
const password = ref('')
const code = ref('')
const trustDevice = ref(true)
const error = ref('')
const busy = ref(false)

/** Only follow local paths, so `?next=` can't send anyone off-site. */
function nextPath() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

async function finish() {
  await session.refresh()
  await navigateTo(nextPath())
}

async function submitPassword() {
  error.value = ''
  busy.value = true
  const { data, error: err } = await authClient.signIn.email({ email: email.value, password: password.value })
  busy.value = false
  if (err) return (error.value = authErrorMessage(err))
  if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
    step.value = 'code'
    return
  }
  await finish()
}

async function submitCode() {
  error.value = ''
  busy.value = true
  const { error: err } = useBackupCode.value
    ? await authClient.twoFactor.verifyBackupCode({ code: code.value.trim(), trustDevice: trustDevice.value })
    : await authClient.twoFactor.verifyTotp({ code: code.value.replace(/\s/g, ''), trustDevice: trustDevice.value })
  busy.value = false
  if (err) return (error.value = authErrorMessage(err))
  await finish()
}

function toggleBackupCode() {
  useBackupCode.value = !useBackupCode.value
  code.value = ''
  error.value = ''
}
</script>

<template>
  <form v-if="step === 'password'" class="flex flex-col gap-6" @submit.prevent="submitPassword">
    <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">Sign in</h1>
    <UiAlert v-if="error">{{ error }}</UiAlert>
    <div class="flex flex-col gap-4">
      <UiField v-model="email" label="Email" type="email" autocomplete="username" required autofocus />
      <UiField v-model="password" label="Password" type="password" autocomplete="current-password" required />
    </div>
    <UiButton type="submit" variant="primary" :loading="busy">Sign in</UiButton>
    <p class="text-sm text-muted">No account? Ask the person who runs this Arca for an invite link.</p>
  </form>

  <form v-else class="flex flex-col gap-6" @submit.prevent="submitCode">
    <div class="flex flex-col gap-2">
      <h1 class="text-[1.75rem] leading-tight font-bold tracking-tight">Two-step verification</h1>
      <p class="text-muted">
        {{
          useBackupCode
            ? 'Enter one of the backup codes you saved when you turned on two-step verification.'
            : 'Enter the 6-digit code from your authenticator app.'
        }}
      </p>
    </div>
    <UiAlert v-if="error">{{ error }}</UiAlert>
    <UiField
      :key="String(useBackupCode)"
      v-model="code"
      :label="useBackupCode ? 'Backup code' : 'Code'"
      :inputmode="useBackupCode ? 'text' : 'numeric'"
      autocomplete="one-time-code"
      required
      autofocus
    />
    <label class="flex items-center gap-2.5 text-sm">
      <input v-model="trustDevice" type="checkbox" class="size-4 accent-(--verdigris)" />
      Don’t ask again on this device for 30 days
    </label>
    <UiButton type="submit" variant="primary" :loading="busy">Verify</UiButton>
    <button
      type="button"
      class="self-start text-sm font-semibold text-accent hover:underline"
      @click="toggleBackupCode"
    >
      {{ useBackupCode ? 'Use your authenticator app instead' : 'Use a backup code instead' }}
    </button>
  </form>
</template>
