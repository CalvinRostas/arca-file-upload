import { z } from 'zod'

const query = z.object({ ids: z.string().min(1) })

// Stream a zip of the given Items (and everything inside folders). GET so the browser downloads it.
export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const ids = (await getValidatedQuery(event, query.parse)).ids.split(',').slice(0, 10_000)
  return sendZip(event, await library.walk(ids), ids.length)
})
