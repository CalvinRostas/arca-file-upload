// Open a Share link: what it is and who shared it. Counts as a view.
export default defineApiHandler(async (event) => {
  const { shares } = await useArca()
  const { grant, items } = await useSharedAccess(event)
  const item = await items.root()
  await shares.recordView(grant)
  return { item, ownerName: grant.ownerName, expiresAt: grant.expiresAt, previews: grant.previews }
})
