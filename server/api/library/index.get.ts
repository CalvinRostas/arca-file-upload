import { z } from 'zod'

const query = z.object({ folder: z.string().optional() })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { folder } = await getValidatedQuery(event, query.parse)
  return library.list(folder || null)
})
