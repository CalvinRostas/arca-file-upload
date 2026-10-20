import { z } from 'zod'

const body = z.object({ name: z.string().optional(), color: z.string().optional() })

export default defineApiHandler(async (event) => {
  const { tags } = await useOwnerScope(event)
  await tags.update(getRouterParam(event, 'id')!, await readValidatedBody(event, body.parse))
  return { ok: true }
})
