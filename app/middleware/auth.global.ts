const PUBLIC = [/^\/login$/, /^\/setup$/, /^\/invite\//]

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSession()
  if (!session.state.value) await session.refresh()
  const { user, needsSetup } = session.state.value!

  if (needsSetup) return to.path === '/setup' ? undefined : navigateTo('/setup')
  if (to.path === '/setup') return navigateTo('/')

  const isPublic = PUBLIC.some((pattern) => pattern.test(to.path))
  if (!user) return isPublic ? undefined : navigateTo({ path: '/login', query: { next: to.fullPath } })
  if (to.path === '/login') return navigateTo('/')
  if (to.meta.admin && user.role !== 'admin') return navigateTo('/')
})
