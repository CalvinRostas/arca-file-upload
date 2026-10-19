import { expect, test, type Page } from '@playwright/test'
import { totp } from './totp'

const admin = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct horse battery' }
const member = { name: 'Bob Builder', email: 'bob@example.com', password: 'another long password' }

async function fillAccount(page: Page, account: typeof admin) {
  await page.getByLabel('Your name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe.configure({ mode: 'serial' })

test('first run: setup creates the admin', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await fillAccount(page, admin)
  await page.getByRole('button', { name: 'Create admin account' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()

  // Setup is gone once an admin exists.
  await page.goto('/setup')
  await expect(page).toHaveURL(/\/$/)
})

test('invite → member account → disable', async ({ page, browser }) => {
  await signIn(page, admin)
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await page.goto('/admin/members')
  await page.getByRole('button', { name: 'Invite someone' }).click()
  await page.getByLabel('Who is it for? (optional)').fill('Bob')
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const inviteUrl = await page.getByLabel('Invite link').inputValue()
  expect(inviteUrl).toMatch(/\/invite\/[\w-]+$/)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Open invites')).toBeVisible()

  // Bob redeems it in his own browser.
  const bobContext = await browser.newContext()
  const bob = await bobContext.newPage()
  await bob.goto(inviteUrl)
  await fillAccount(bob, member)
  await bob.getByRole('button', { name: 'Create account' }).click()
  await expect(bob.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(bob.getByRole('link', { name: 'Members' })).toHaveCount(0)
  await bob.goto('/admin/members')
  await expect(bob).toHaveURL(/\/$/)

  // The link is single-use.
  const stranger = await (await browser.newContext()).newPage()
  await stranger.goto(inviteUrl)
  await expect(stranger.getByRole('heading', { name: 'This invite link doesn’t work' })).toBeVisible()

  // Ada disables Bob: his session ends and he can't sign back in.
  await page.reload()
  await expect(page.getByText('Open invites')).toHaveCount(0)
  const bobRow = page.getByRole('listitem').filter({ hasText: member.email })
  await bobRow.getByRole('button', { name: 'Disable' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click()
  await expect(bobRow.getByText('Disabled', { exact: true })).toBeVisible()

  await bob.reload()
  await expect(bob).toHaveURL(/\/login/)
  await signIn(bob, member)
  await expect(bob.getByRole('alert')).toContainText('This account has been disabled')

  // And back on.
  await bobRow.getByRole('button', { name: 'Turn back on' }).click()
  await expect(bobRow.getByText('Disabled', { exact: true })).toHaveCount(0)
  await signIn(bob, member)
  await expect(bob.getByRole('heading', { name: 'Library' })).toBeVisible()
  await bobContext.close()
})

test('two-step verification: turn on, then sign in with a code', async ({ page }) => {
  await signIn(page, admin)
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await page.goto('/settings/security')
  await page.getByRole('button', { name: 'Turn on' }).click()
  await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(admin.password)
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByText('Can’t scan it?').click()
  const secret = await page.getByLabel('Setup key').inputValue()
  await page.getByRole('dialog').getByLabel('Code').fill(totp(secret))
  await page.getByRole('dialog').getByRole('button', { name: 'Turn on' }).click()
  await expect(page.getByRole('heading', { name: 'Save your backup codes' })).toBeVisible()
  const backupCode = (await page.getByRole('dialog').getByRole('listitem').first().textContent())!.trim()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toContainText('On')

  // Sign out, then back in: password alone isn't enough any more.
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await signIn(page, admin)
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible()
  await page.getByLabel('Code').fill('000000')
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('alert')).toContainText('didn’t work')

  await page.getByRole('button', { name: 'Use a backup code instead' }).click()
  await page.getByLabel('Backup code').fill(backupCode)
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
})
