import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { signInAsAdmin } from './support'

const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^Open (folder )?${name}$`) })

async function openShareDialog(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Share…' }).click()
  return page.getByRole('dialog', { name: `Share “${name}”` })
}

test('share a folder with a password and a download limit, open it signed out, stop sharing', async ({
  page,
  browser,
}) => {
  const dir = await mkdtemp(join(tmpdir(), 'arca-share-'))
  const notes = join(dir, 'packing-list.txt')
  await writeFile(notes, 'tent, stove, socks')

  await signInAsAdmin(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Camping')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tile(page, 'Camping').click()
  await expect(page.getByRole('heading', { name: 'Camping', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Files' }).click()
  await (await chooser).setFiles([notes])
  await expect(tile(page, 'packing-list.txt')).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Library' }).click()

  // Create a password-protected link.
  let dialog = await openShareDialog(page, 'Camping')
  await dialog.getByRole('switch', { name: /Password/ }).click()
  await dialog.getByLabel('Password', { exact: true }).fill('open sesame')
  await dialog.getByRole('button', { name: 'Create link' }).click()
  const url = await dialog.getByRole('textbox', { name: 'Share link' }).inputValue()
  expect(url).toMatch(/\/s\/[\w-]{22}$/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Open folder Camping' }).getByLabel('Shared')).toBeVisible()

  // A visitor, signed out: password first, then the folder.
  const visitor = await (await browser.newContext()).newPage()
  await visitor.goto(url)
  await expect(visitor.getByRole('heading', { name: 'This link is protected' })).toBeVisible()
  await expect(visitor.getByText('Camping')).toHaveCount(0)
  await visitor.getByLabel('Password', { exact: true }).fill('wrong')
  await visitor.getByRole('button', { name: 'Open' }).click()
  await expect(visitor.getByText('That password isn’t right')).toBeVisible()
  await visitor.getByLabel('Password', { exact: true }).fill('open sesame')
  await visitor.getByRole('button', { name: 'Open' }).click()
  await expect(visitor.getByRole('heading', { name: 'Camping', level: 1 })).toBeVisible()
  await expect(visitor.getByText('Shared by Ada Lovelace')).toBeVisible()

  await tile(visitor, 'packing-list.txt').click()
  await expect(visitor.getByRole('dialog').getByText('tent, stove, socks')).toBeVisible()
  await visitor.keyboard.press('Escape')
  const download = visitor.waitForEvent('download')
  await visitor.getByRole('link', { name: 'Download packing-list.txt' }).click()
  expect(await readFile(await (await download).path(), 'utf8')).toBe('tent, stove, socks')

  // The Owner sees the activity, and limits downloads to two (one is used).
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shared' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Camping' })
  await expect(row).toContainText('Password')
  await expect(row).toContainText('Opened once · 1 download')
  await row.getByRole('button', { name: 'Edit link to Camping' }).click()
  dialog = page.getByRole('dialog', { name: 'Share “Camping”' })
  await dialog.getByRole('switch', { name: /Limit downloads/ }).click()
  await dialog.getByLabel('Downloads allowed').fill('2')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByText('1 used so far.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(row).toContainText('1 of 2 downloads')

  // The second download uses it up; the link says so.
  await visitor.reload()
  const zip = visitor.waitForEvent('download')
  await visitor.getByRole('link', { name: 'Download all' }).click()
  expect((await zip).suggestedFilename()).toBe('Camping.zip')
  await visitor.reload()
  await expect(visitor.getByRole('heading', { name: 'This link has reached its download limit' })).toBeVisible()

  // Stop sharing: the link is gone for good.
  await page.reload()
  await expect(row).toContainText('Download limit reached')
  await row.getByRole('button', { name: 'Edit link to Camping' }).click()
  await dialog.getByRole('button', { name: 'Stop sharing' }).click()
  await dialog.getByRole('button', { name: 'Stop sharing' }).click()
  await expect(page.getByText('Nothing shared yet')).toBeVisible()
  await visitor.reload()
  await expect(visitor.getByRole('heading', { name: 'This link isn’t available' })).toBeVisible()
})
