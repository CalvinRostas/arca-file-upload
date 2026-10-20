import { z } from 'zod'

const query = z.object({ q: z.string().max(1000).default(''), within: z.string().optional() })

export default defineApiHandler(async (event) => {
  const { search } = await useOwnerScope(event)
  const { q, within } = await getValidatedQuery(event, query.parse)
  return search.search(q, { within: within || null })
})
