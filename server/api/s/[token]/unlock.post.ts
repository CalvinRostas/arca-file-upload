import { z } from 'zod'

const body = z.object({ password: z.string().max(256) })

// Check a Share link's password and remember it in a cookie for this link.
export default defineApiHandler(async (event) => {
  const { shares } = await useArca()
  const token = getRouterParam(event, 'token')!
  const { password } = await readValidatedBody(event, body.parse)
  const pass = await shares.unlock(token, password)
  setCookie(event, passCookie(token), pass.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useRuntimeConfig().baseUrl.startsWith('https:'),
    path: '/',
    maxAge: pass.maxAgeSeconds,
  })
  return { ok: true }
})
