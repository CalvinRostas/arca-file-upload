import { z } from 'zod'

const query = z.object({ folder: z.string().optional() })

// A Folder's contents inside a shared Folder (the shared Folder itself by default).
export default defineApiHandler(async (event) => {
  const { items } = await useSharedAccess(event)
  const { folder } = await getValidatedQuery(event, query.parse)
  return items.list(folder || null)
})
