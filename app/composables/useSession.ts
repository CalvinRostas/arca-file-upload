export interface SessionUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  twoFactorEnabled: boolean
}

interface SessionState {
  user: SessionUser | null
  needsSetup: boolean
}

/** Who is signed in. Loaded once per page load, refreshed after anything that changes it. */
export function useSession() {
  const state = useState<SessionState | null>('session', () => null)
  const headers = useRequestHeaders(['cookie'])

  async function refresh() {
    state.value = await $fetch<SessionState>('/api/session', { headers })
  }

  async function signOut() {
    await authClient.signOut()
    state.value = { user: null, needsSetup: false }
    await navigateTo('/login')
  }

  return {
    state,
    user: computed(() => state.value?.user ?? null),
    isAdmin: computed(() => state.value?.user?.role === 'admin'),
    refresh,
    signOut,
  }
}
