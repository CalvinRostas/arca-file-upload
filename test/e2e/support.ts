import { expect, type Page } from '@playwright/test'

export const admin = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' }

/** Signed in as the admin, creating it first if this server is fresh. Works in any spec order. */
export async function signInAsAdmin(page: Page) {
  const headers = { origin: process.env.E2E_ORIGIN! }
  const session = await (await page.request.get('/api/session')).json()
  if (session.needsSetup) {
    await page.request.post('/api/setup', { data: admin, headers })
  } else {
    const res = await page.request.post('/api/auth/sign-in/email', {
      data: { email: admin.email, password: admin.password },
      headers,
    })
    expect(res.ok()).toBe(true)
  }
}
