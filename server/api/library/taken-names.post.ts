import { z } from 'zod'

const body = z.object({ folderId: z.string().nullable(), names: z.array(z.string()).max(10_000) })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { folderId, names } = await readValidatedBody(event, body.parse)
  return { taken: await library.takenNames(folderId, names) }
})
