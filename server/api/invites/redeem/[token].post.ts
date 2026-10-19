export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  const body = await readValidatedBody(event, newAccountBody.parse)
  forwardSetCookies(event, await auth.redeemInvite(getRouterParam(event, 'token')!, body))
  return { ok: true }
})
