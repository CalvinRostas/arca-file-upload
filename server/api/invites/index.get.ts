export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  await auth.requireAdmin(event.headers)
  return auth.listInvites()
})
