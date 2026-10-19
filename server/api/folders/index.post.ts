import { z } from 'zod'

const body = z.object({ parentId: z.string().nullable(), name: z.string() })

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { parentId, name } = await readValidatedBody(event, body.parse)
  return library.createFolder(parentId, name)
})
