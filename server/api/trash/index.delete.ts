export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  return { deleted: await library.emptyTrash() }
})
