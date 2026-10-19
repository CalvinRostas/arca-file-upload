export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  await library.discardDuplicate(getRouterParam(event, 'id')!)
  return { ok: true }
})
