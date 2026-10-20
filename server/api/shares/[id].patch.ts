export default defineApiHandler(async (event) => {
  const shares = await useOwnerShares(event)
  const settings = await readValidatedBody(event, shareSettingsBody.parse)
  return shares.update(getRouterParam(event, 'id')!, settings)
})
