export default defineApiHandler(async (event) => {
  const { tags } = await useOwnerScope(event)
  await tags.remove(getRouterParam(event, 'id')!)
  return { ok: true }
})
