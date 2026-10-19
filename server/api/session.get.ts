export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  const [user, needsSetup] = await Promise.all([auth.currentUser(event.headers), auth.needsSetup()])
  return { user, needsSetup }
})
