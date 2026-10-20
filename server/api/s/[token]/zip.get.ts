import { z } from 'zod'

const query = z.object({ ids: z.string().optional() })

// A zip of the shared Folder, or of some Items inside it. Counts as one download.
export default defineApiHandler(async (event) => {
  const { shares } = await useArca()
  const { grant, items } = await useSharedAccess(event)
  const ids = (await getValidatedQuery(event, query.parse)).ids?.split(',').slice(0, 10_000)
  const entries = await items.walk(ids)
  await shares.recordDownload(grant)
  return sendZip(event, entries, ids?.length ?? 1)
})
