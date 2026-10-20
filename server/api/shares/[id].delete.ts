export default defineApiHandler(async (event) => {
  await (await useOwnerShares(event)).revoke(getRouterParam(event, 'id')!)
  return { ok: true }
})
