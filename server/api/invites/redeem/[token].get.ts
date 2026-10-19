export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  return { redeemable: await auth.isInviteRedeemable(getRouterParam(event, 'token')!) }
})
