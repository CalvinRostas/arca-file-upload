import { z } from 'zod'

const body = z.object({ ids: z.array(z.string()).min(1).max(10_000) })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { ids } = await readValidatedBody(event, body.parse)
  await library.deleteForever(ids)
  return { ok: true }
})
