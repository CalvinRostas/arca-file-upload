<script setup lang="ts">
definePageMeta({ admin: true })
useHead({ title: 'Members · Arca' })

interface Member {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  disabled: boolean
  twoFactorEnabled: boolean
  createdAt: string
}

interface Invite {
  id: string
  note: string | null
  createdAt: string
  expiresAt: string
  status: 'pending' | 'expired' | 'redeemed'
}

const session = useSession()
const { data: members, refresh: refreshMembers } = await useFetch<Member[]>('/api/members', { default: () => [] })
const { data: invites, refresh: refreshInvites } = await useFetch<Invite[]>('/api/invites', { default: () => [] })
const pendingInvites = computed(() => invites.value.filter((i) => i.status === 'pending'))

// ── Invite someone ──────────────────────────────────────────────────────────

const inviteOpen = ref(false)
const inviteNote = ref('')
const inviteUrl = ref('')
const inviteError = ref('')
const inviteBusy = ref(false)

function openInvite() {
  inviteNote.value = ''
  inviteUrl.value = ''
  inviteError.value = ''
  inviteOpen.value = true
}

async function createInvite() {
  inviteError.value = ''
  inviteBusy.value = true
  try {
    const result = await $fetch('/api/invites', { method: 'POST', body: { note: inviteNote.value || undefined } })
    inviteUrl.value = result.url
    await refreshInvites()
  } catch (e) {
    inviteError.value = apiErrorMessage(e)
  } finally {
    inviteBusy.value = false
  }
}

async function revokeInvite(id: string) {
  await $fetch(`/api/invites/${id}`, { method: 'DELETE' })
  await refreshInvites()
}

// ── Disable / re-enable ─────────────────────────────────────────────────────

const confirming = ref<Member | null>(null)
const confirmOpen = computed({
  get: () => confirming.value !== null,
  set: (open) => {
    if (!open) confirming.value = null
  },
})
const toggleError = ref('')
const toggleBusy = ref(false)

async function setDisabled(member: Member, disabled: boolean) {
  toggleError.value = ''
  toggleBusy.value = true
  try {
    await $fetch(`/api/members/${member.id}/disabled`, { method: 'PUT', body: { disabled } })
    confirming.value = null
    await refreshMembers()
  } catch (e) {
    toggleError.value = apiErrorMessage(e)
  } finally {
    toggleBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="text-[2rem] leading-tight font-bold tracking-tight">Members</h1>
        <p class="text-muted">Everyone who can sign in to this Arca. Each person only sees their own files.</p>
      </div>
      <UiButton class="ml-auto" variant="primary" icon="lucide:user-plus" @click="openInvite">Invite someone</UiButton>
    </div>

    <section aria-label="Members" class="overflow-hidden rounded-panel border border-line bg-surface">
      <ul class="divide-y divide-line">
        <li v-for="member in members" :key="member.id" class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-full font-bold"
            :class="member.disabled ? 'bg-sunken text-faint' : 'bg-accent-wash text-accent-strong'"
          >
            {{ member.name.charAt(0).toUpperCase() }}
          </span>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="flex items-center gap-2 font-semibold" :class="member.disabled && 'text-muted'">
              <span class="truncate">{{ member.name }}</span>
              <span v-if="member.id === session.user.value?.id" class="text-sm font-normal text-faint">(you)</span>
            </span>
            <span class="truncate text-sm text-muted">{{ member.email }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span v-if="member.role === 'admin'" class="rounded-full bg-accent-wash px-2.5 py-0.5 text-accent-strong">
              Admin
            </span>
            <span v-if="member.disabled" class="rounded-full bg-danger-wash px-2.5 py-0.5 text-danger">Disabled</span>
            <span
              class="flex items-center gap-1 rounded-full bg-sunken px-2.5 py-0.5 text-muted"
              :title="member.twoFactorEnabled ? 'Two-step verification is on' : 'Two-step verification is off'"
            >
              <Icon :name="member.twoFactorEnabled ? 'lucide:shield-check' : 'lucide:shield'" class="size-3.5" />
              {{ member.twoFactorEnabled ? '2-step on' : '2-step off' }}
            </span>
            <span class="text-faint">Joined {{ formatDate(member.createdAt) }}</span>
          </div>
          <div v-if="member.id !== session.user.value?.id" class="w-28 text-right">
            <UiButton v-if="member.disabled" size="sm" @click="setDisabled(member, false)">Turn back on</UiButton>
            <UiButton v-else size="sm" variant="ghost" @click="confirming = member">Disable</UiButton>
          </div>
          <div v-else class="w-28" />
        </li>
      </ul>
    </section>

    <section v-if="pendingInvites.length" class="flex flex-col gap-3">
      <h2 class="text-base font-semibold text-muted">Open invites</h2>
      <ul class="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        <li v-for="invite in pendingInvites" :key="invite.id" class="flex items-center gap-4 px-5 py-3.5">
          <Icon name="lucide:mail" class="size-4.5 shrink-0 text-faint" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate">{{ invite.note || 'Invite link' }}</span>
            <span class="text-sm text-muted">Expires {{ formatFromNow(invite.expiresAt) }}</span>
          </div>
          <UiButton size="sm" variant="ghost" @click="revokeInvite(invite.id)">Revoke</UiButton>
        </li>
      </ul>
    </section>

    <UiDialog
      v-model:open="inviteOpen"
      title="Invite someone"
      description="They’ll choose their own email and password. The link works once and expires in 7 days."
    >
      <form v-if="!inviteUrl" class="flex flex-col gap-5" @submit.prevent="createInvite">
        <UiAlert v-if="inviteError">{{ inviteError }}</UiAlert>
        <UiField
          v-model="inviteNote"
          label="Who is it for? (optional)"
          hint="Only you see this, to tell open invites apart."
          autofocus
        />
        <div class="flex justify-end gap-2">
          <UiButton variant="ghost" @click="inviteOpen = false">Cancel</UiButton>
          <UiButton type="submit" variant="primary" :loading="inviteBusy">Create invite link</UiButton>
        </div>
      </form>
      <div v-else class="flex flex-col gap-5">
        <UiCopyField :value="inviteUrl" label="Invite link" />
        <p class="text-sm text-muted">
          Send this link privately. It’s only shown now. If you lose it, revoke it and create a new one.
        </p>
        <div class="flex justify-end">
          <UiButton variant="primary" @click="inviteOpen = false">Done</UiButton>
        </div>
      </div>
    </UiDialog>

    <UiDialog
      v-model:open="confirmOpen"
      :title="`Disable ${confirming?.name ?? ''}?`"
      description="They’ll be signed out everywhere and can’t sign in until you turn their account back on. Their files stay where they are."
    >
      <UiAlert v-if="toggleError">{{ toggleError }}</UiAlert>
      <div class="flex justify-end gap-2">
        <UiButton variant="ghost" @click="confirming = null">Cancel</UiButton>
        <UiButton variant="danger" :loading="toggleBusy" @click="confirming && setDisabled(confirming, true)">
          Disable
        </UiButton>
      </div>
    </UiDialog>
  </div>
</template>
