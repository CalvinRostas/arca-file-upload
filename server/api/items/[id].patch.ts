import { z } from 'zod'

const body = z.object({ name: z.string() })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { name } = await readValidatedBody(event, body.parse)
  return library.rename(getRouterParam(event, 'id')!, name)
})
