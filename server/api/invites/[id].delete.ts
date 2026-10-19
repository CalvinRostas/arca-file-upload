export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  await auth.requireAdmin(event.headers)
  await auth.revokeInvite(getRouterParam(event, 'id')!)
  return { ok: true }
})
