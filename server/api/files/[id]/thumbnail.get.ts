export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  // Trash shows thumbnails too; the File's content stays unreachable while it's there.
  const file = await library.getFile(getRouterParam(event, 'id')!, { includeTrashed: true })
  return sendThumbnail(event, file)
})
