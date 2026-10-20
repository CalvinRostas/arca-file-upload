<script setup lang="ts">
import type { ShareLink } from '~/types/library'

// Create, change or stop an Item's Share link.
const props = defineProps<{ item: { id: string; name: string; kind: 'folder' | 'file' } | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const link = ref<ShareLink | null>(null)
const loading = ref(false)
const error = ref('')
const busy = ref<'save' | 'revoke' | null>(null)
const confirmingRevoke = ref(false)

const DAY = 86_400_000
const form = reactive({ password: false, newPassword: '', expires: false, date: '', limit: false, max: '1' })
let initial = { ...form }

/** yyyy-mm-dd in local time, as `<input type="date">` wants it. */
const dateValue = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = computed(() => dateValue(new Date()))
/** The end of the picked day, local time. */
function endOfDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999)
}

function reset(current: ShareLink | null) {
  Object.assign(form, {
    password: current?.hasPassword ?? false,
    newPassword: '',
    expires: current?.expiresAt != null,
    date: dateValue(current?.expiresAt ? new Date(current.expiresAt) : new Date(Date.now() + 7 * DAY)),
    limit: current?.maxDownloads != null,
    max: String(current?.maxDownloads ?? 1),
  })
  initial = { ...form }
}

watch(
  open,
  async (isOpen) => {
    if (!isOpen || !props.item) return
    link.value = null
    error.value = ''
    confirmingRevoke.value = false
    reset(null)
    loading.value = true
    try {
      link.value = await $fetch<ShareLink | null>(`/api/items/${props.item.id}/share`)
      reset(link.value)
    } catch (e) {
      error.value = apiErrorMessage(e)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

/** Only what changed, so an untouched (maybe past) expiry isn't sent back. */
const changes = computed(() => {
  const body: { password?: string | null; expiresAt?: string | null; maxDownloads?: number | null } = {}
  if (!form.password && initial.password) body.password = null
  if (form.password && form.newPassword) body.password = form.newPassword
  if (form.expires !== initial.expires || (form.expires && form.date !== initial.date)) {
    body.expiresAt = form.expires ? endOfDay(form.date).toISOString() : null
  }
  if (form.limit !== initial.limit || (form.limit && form.max !== initial.max)) {
    body.maxDownloads = form.limit ? Number(form.max) : null
  }
  return body
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

async function save() {
  error.value = ''
  if (form.password && !form.newPassword && !link.value?.hasPassword) {
    error.value = 'Enter a password, or turn the password off'
    return
  }
  busy.value = 'save'
  try {
    link.value = link.value
      ? await $fetch<ShareLink>(`/api/shares/${link.value.id}`, { method: 'PATCH', body: changes.value })
      : await $fetch<ShareLink>('/api/shares', { method: 'POST', body: { itemId: props.item!.id, ...changes.value } })
    reset(link.value)
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = null
  }
}

async function revoke() {
  error.value = ''
  busy.value = 'revoke'
  try {
    await $fetch(`/api/shares/${link.value!.id}`, { method: 'DELETE' })
    open.value = false
    useToasts().show({ icon: 'lucide:link-2-off', message: `Stopped sharing “${props.item!.name}”` })
    emit('changed')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = null
  }
}

const description = computed(() =>
  props.item?.kind === 'folder'
    ? 'Anyone with the link can browse and download this folder, including what you add to it later.'
    : 'Anyone with the link can view and download this file.',
)
</script>

<template>
  <UiDialog v-model:open="open" :title="`Share “${props.item?.name ?? ''}”`" :description="description">
    <div v-if="loading" class="flex items-center gap-2 py-6 text-muted">
      <Icon name="lucide:loader-circle" class="size-4 animate-spin" /> Loading…
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="save">
      <div v-if="link" class="flex flex-col gap-2">
        <UiCopyField :value="shareUrl(link.token)" label="Share link" />
        <p class="text-sm" :class="link.status === 'active' ? 'text-muted' : 'font-semibold text-danger'">
          {{ link.status === 'active' ? shareActivityLabel(link) : shareStatusLabel[link.status] }}
        </p>
      </div>

      <div class="flex flex-col gap-5 rounded-tile border border-line p-4">
        <UiSwitch v-model="form.password" label="Password" hint="Visitors type it before they see anything.">
          <UiField
            v-model="form.newPassword"
            type="password"
            autocomplete="new-password"
            :label="link?.hasPassword ? 'New password' : 'Password'"
            :hint="link?.hasPassword ? 'Leave empty to keep the current one.' : undefined"
          />
        </UiSwitch>
        <UiSwitch v-model="form.expires" label="Expires" hint="The link stops working after this day.">
          <UiField v-model="form.date" type="date" label="Last day" :min="today" required />
        </UiSwitch>
        <UiSwitch v-model="form.limit" label="Limit downloads" hint="Previews in the browser are off while it’s on.">
          <UiField
            v-model="form.max"
            type="number"
            inputmode="numeric"
            label="Downloads allowed"
            :hint="link ? `${link.downloads} used so far.` : undefined"
            required
          />
        </UiSwitch>
      </div>

      <UiAlert v-if="error">{{ error }}</UiAlert>

      <div v-if="confirmingRevoke" class="flex flex-wrap items-center gap-2 rounded-tile bg-danger-wash p-3">
        <p class="mr-auto text-sm font-semibold text-danger">Anyone with the link loses access.</p>
        <UiButton size="sm" variant="ghost" @click="confirmingRevoke = false">Cancel</UiButton>
        <UiButton size="sm" variant="danger" icon="lucide:link-2-off" :loading="busy === 'revoke'" @click="revoke">
          Stop sharing
        </UiButton>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <UiButton v-if="link" variant="danger" icon="lucide:link-2-off" @click="confirmingRevoke = true">
          Stop sharing
        </UiButton>
        <UiButton variant="ghost" class="ml-auto" @click="open = false">{{ link ? 'Done' : 'Cancel' }}</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :icon="link ? undefined : 'lucide:link'"
          :disabled="!!link && !dirty"
          :loading="busy === 'save'"
        >
          {{ link ? 'Save' : 'Create link' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
