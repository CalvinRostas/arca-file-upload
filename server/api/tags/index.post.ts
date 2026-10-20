import { z } from 'zod'

const body = z.object({ name: z.string(), color: z.string() })

export default defineApiHandler(async (event) => {
  const { tags } = await useOwnerScope(event)
  const { name, color } = await readValidatedBody(event, body.parse)
  return tags.create(name, color)
})
