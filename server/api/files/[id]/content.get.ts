// Download a File; `?inline=1` displays it in the browser instead (see sendStoredFile).
export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const file = await library.getFile(getRouterParam(event, 'id')!)
  return sendStoredFile(event, file, { preview: getQuery(event).inline === '1' })
})
