export default defineApiHandler(async (event) => {
  const { grant, items } = await useSharedAccess(event)
  const file = await items.getFile(getRouterParam(event, 'id')!)
  return sendStoredFile(event, file, await sharedFileOptions(event, grant))
})
