export default defineApiHandler(async (event) => {
  const { items } = await useSharedAccess(event)
  return sendThumbnail(event, await items.getFile(getRouterParam(event, 'id')!))
})
