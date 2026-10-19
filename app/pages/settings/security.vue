<script setup lang="ts">
import QRCode from 'qrcode'

useHead({ title: 'Password and sign-in · Arca' })

const session = useSession()
const twoFactorOn = computed(() => session.user.value?.twoFactorEnabled ?? false)

// ── Change password ─────────────────────────────────────────────────────────

const pw = reactive({ current: '', next: '' })
const pwError = ref('')
const pwDone = ref(false)
const pwBusy = ref(false)

async function changePassword() {
  pwError.value = ''
  pwDone.value = false
  pwBusy.value = true
  const { error } = await authClient.changePassword({
    currentPassword: pw.current,
    newPassword: pw.next,
    revokeOtherSessions: true,
  })
  pwBusy.value = false
  if (error) return (pwError.value = authErrorMessage(error))
  pw.current = ''
  pw.next = ''
  pwDone.value = true
}

// ── Two-step verification ───────────────────────────────────────────────────

type Step = 'password' | 'scan' | 'codes'
const dialogOpen = ref(false)
const mode = ref<'enable' | 'disable'>('enable')
const step = ref<Step>('password')
const password = ref('')
const code = ref('')
const qr = ref('')
const secret = ref('')
const backupCodes = ref<string[]>([])
const error = ref('')
const busy = ref(false)

function start(next: 'enable' | 'disable') {
  mode.value = next
  step.value = 'password'
  password.value = ''
  code.value = ''
  error.value = ''
  dialogOpen.value = true
}

async function confirmPassword() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'disable') {
      const { error: err } = await authClient.twoFactor.disable({ password: password.value })
      if (err) return (error.value = authErrorMessage(err))
      await session.refresh()
      dialogOpen.value = false
      return
    }
    const { data, error: err } = await authClient.twoFactor.enable({
      password: password.value,
      issuer: 'Arca',
      method: 'totp',
    })
    if (err || data?.method !== 'totp') return (error.value = authErrorMessage(err))
    backupCodes.value = data.backupCodes
    secret.value = new URL(data.totpURI).searchParams.get('secret') ?? ''
    qr.value = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 })
    step.value = 'scan'
  } finally {
    busy.value = false
  }
}

async function verifyCode() {
  error.value = ''
  busy.value = true
  const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.value.replace(/\s/g, '') })
  busy.value = false
  if (err) return (error.value = authErrorMessage(err))
  await session.refresh()
  step.value = 'codes'
}

function downloadCodes() {
  const text = `Arca backup codes for ${session.user.value?.email}\nEach code works once.\n\n${backupCodes.value.join('\n')}\n`
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: 'arca-backup-codes.txt' })
  link.click()
  URL.revokeObjectURL(url)
}

const dialogTitle = computed(() => {
  if (mode.value === 'disable') return 'Turn off two-step verification'
  return { password: 'Turn on two-step verification', scan: 'Scan this code', codes: 'Save your backup codes' }[
    step.value
  ]
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Password and sign-in</h1>

    <div class="flex max-w-2xl flex-col gap-6">
      <section class="flex flex-col gap-5 rounded-panel border border-line bg-surface p-6">
        <div class="flex items-start gap-4">
          <div class="flex flex-1 flex-col gap-1">
            <h2 class="flex items-center gap-2 text-lg font-bold">
              Two-step verification
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="twoFactorOn ? 'bg-accent-wash text-accent-strong' : 'bg-sunken text-muted'"
              >
                {{ twoFactorOn ? 'On' : 'Off' }}
              </span>
            </h2>
            <p class="text-muted">
              After your password, Arca also asks for a code from an authenticator app on your phone, such as 1Password,
              Aegis, or Google Authenticator.
            </p>
          </div>
        </div>
        <div>
          <UiButton v-if="!twoFactorOn" variant="primary" icon="lucide:shield-check" @click="start('enable')">
            Turn on
          </UiButton>
          <UiButton v-else variant="secondary" @click="start('disable')">Turn off</UiButton>
        </div>
      </section>

      <section class="flex flex-col gap-5 rounded-panel border border-line bg-surface p-6">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg font-bold">Change password</h2>
          <p class="text-muted">You’ll stay signed in here. Other devices are signed out.</p>
        </div>
        <form class="flex max-w-sm flex-col gap-4" @submit.prevent="changePassword">
          <UiAlert v-if="pwError">{{ pwError }}</UiAlert>
          <UiAlert v-else-if="pwDone" tone="info">Password changed. Other devices have been signed out.</UiAlert>
          <UiField
            v-model="pw.current"
            label="Current password"
            type="password"
            autocomplete="current-password"
            required
          />
          <UiField
            v-model="pw.next"
            label="New password"
            type="password"
            autocomplete="new-password"
            hint="At least 10 characters."
            required
          />
          <div>
            <UiButton type="submit" :loading="pwBusy">Change password</UiButton>
          </div>
        </form>
      </section>
    </div>

    <UiDialog v-model:open="dialogOpen" :title="dialogTitle">
      <form v-if="step === 'password'" class="flex flex-col gap-5" @submit.prevent="confirmPassword">
        <p class="text-muted">
          {{
            mode === 'enable'
              ? 'Confirm your password to continue.'
              : 'You’ll only need your password to sign in. Confirm it to continue.'
          }}
        </p>
        <UiAlert v-if="error">{{ error }}</UiAlert>
        <UiField
          v-model="password"
          label="Password"
          type="password"
          autocomplete="current-password"
          required
          autofocus
        />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="dialogOpen = false">Cancel</UiButton>
          <UiButton type="submit" :variant="mode === 'enable' ? 'primary' : 'danger'" :loading="busy">
            {{ mode === 'enable' ? 'Continue' : 'Turn off' }}
          </UiButton>
        </div>
      </form>

      <form v-else-if="step === 'scan'" class="flex flex-col gap-5" @submit.prevent="verifyCode">
        <p class="text-muted">Scan it with your authenticator app, then enter the 6-digit code the app shows.</p>
        <div class="flex flex-col items-center gap-3 rounded-tile bg-sunken p-5">
          <img :src="qr" alt="QR code for your authenticator app" width="200" height="200" class="rounded-control" />
          <details class="w-full text-sm">
            <summary class="cursor-pointer text-center text-muted hover:text-ink">Can’t scan it?</summary>
            <p class="mt-2 text-muted">Enter this key in your app instead:</p>
            <UiCopyField class="mt-2" :value="secret" label="Setup key" />
          </details>
        </div>
        <UiAlert v-if="error">{{ error }}</UiAlert>
        <UiField v-model="code" label="Code" inputmode="numeric" autocomplete="one-time-code" required autofocus />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="dialogOpen = false">Cancel</UiButton>
          <UiButton type="submit" variant="primary" :loading="busy">Turn on</UiButton>
        </div>
      </form>

      <div v-else class="flex flex-col gap-5">
        <p class="text-muted">
          If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe, like a password
          manager.
        </p>
        <ul class="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-tile bg-sunken p-5 text-center">
          <li v-for="c in backupCodes" :key="c" class="font-semibold tracking-wide">{{ c }}</li>
        </ul>
        <div class="flex justify-end gap-2">
          <UiButton icon="lucide:download" @click="downloadCodes">Download</UiButton>
          <UiButton variant="primary" @click="dialogOpen = false">Done</UiButton>
        </div>
      </div>
    </UiDialog>
  </div>
</template>
