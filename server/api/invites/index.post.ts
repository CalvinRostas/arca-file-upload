import { z } from 'zod'

const body = z.object({ note: z.string().max(200).optional() })

export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  const admin = await auth.requireAdmin(event.headers)
  const { note } = await readValidatedBody(event, body.parse)
  const { token, invite } = await auth.createInvite(admin, { note })
  return { invite, url: `${useRuntimeConfig().baseUrl}/invite/${token}` }
})
