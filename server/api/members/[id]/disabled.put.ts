import { z } from 'zod'

const body = z.object({ disabled: z.boolean() })

export default defineApiHandler(async (event) => {
  const { auth } = await useArca()
  const admin = await auth.requireAdmin(event.headers)
  const { disabled } = await readValidatedBody(event, body.parse)
  await auth.setMemberDisabled(admin, getRouterParam(event, 'id')!, disabled)
  return { ok: true }
})
