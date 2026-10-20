import { z } from 'zod'

const ids = z.array(z.string()).max(10_000)
const body = z.object({ fileIds: ids.min(1), add: ids.optional(), remove: ids.optional() })

export default defineApiHandler(async (event) => {
  const { tags } = await useOwnerScope(event)
  const { fileIds, add, remove } = await readValidatedBody(event, body.parse)
  await tags.apply(fileIds, { add, remove })
  return { ok: true }
})
