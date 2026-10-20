export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  return library.trashEntries()
})
