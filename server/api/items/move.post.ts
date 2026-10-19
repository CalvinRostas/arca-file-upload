import { z } from 'zod'

const body = z.object({ ids: z.array(z.string()).min(1).max(10_000), targetId: z.string().nullable() })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { ids, targetId } = await readValidatedBody(event, body.parse)
  await library.move(ids, targetId)
  return { ok: true }
})
