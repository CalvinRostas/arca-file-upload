import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { signInAsAdmin } from './support'

test.describe.configure({ mode: 'serial' })

const exact = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tile = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Open (folder )?${exact(name)}$`) })
const toast = (page: Page) => page.getByRole('status').filter({ hasText: /Trash|Restored|Deleted/ })

async function uploadFiles(page: Page, paths: string[]) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Files' }).click()
  await (await chooser).setFiles(paths)
}

async function trashFromMenu(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
}

test('move to Trash with undo, restore with its folder, delete forever, empty Trash', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'arca-trash-'))
  const letter = join(dir, 'old-letter.txt')
  const draft = join(dir, 'draft.txt')
  await writeFile(letter, 'Dear diary')
  await writeFile(draft, 'first draft')

  await signInAsAdmin(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Attic')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tile(page, 'Attic').click()
  await expect(page.getByRole('heading', { name: 'Attic', level: 1 })).toBeVisible()
  await uploadFiles(page, [letter, draft])
  await expect(tile(page, 'draft.txt')).toBeVisible()
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Library' }).click()

  // Trash the folder, then undo from the confirmation.
  await trashFromMenu(page, 'Attic')
  await expect(toast(page)).toContainText('Moved “Attic” to Trash')
  await expect(tile(page, 'Attic')).toHaveCount(0)
  await toast(page).getByRole('button', { name: 'Undo' }).click()
  await expect(tile(page, 'Attic')).toBeVisible()

  // Trash it again and restore it from the Trash page; "Show" leads back to it.
  await trashFromMenu(page, 'Attic')
  await expect(tile(page, 'Attic')).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Trash' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Attic' })
  await expect(row).toContainText('Folder · 2 files')
  await expect(row).toContainText('from Library')
  await row.getByRole('button', { name: 'Restore Attic' }).click()
  await expect(row).toHaveCount(0)
  await expect(toast(page)).toContainText('Restored “Attic” to Library')
  await toast(page).getByRole('button', { name: 'Show' }).click()
  await expect(page).toHaveURL(/\/$/)
  await tile(page, 'Attic').click()
  await expect(tile(page, 'old-letter.txt')).toBeVisible()

  // Select both files and press Delete.
  await page.getByRole('checkbox', { name: 'Select old-letter.txt' }).click()
  await page.getByRole('checkbox', { name: 'Select draft.txt' }).click()
  await page.keyboard.press('Delete')
  await expect(toast(page)).toContainText('Moved 2 items to Trash')
  await expect(page.getByText('This folder is empty')).toBeVisible()

  // Delete one forever, then empty the rest.
  await page.goto('/trash')
  const letterRow = page.getByRole('listitem').filter({ hasText: 'old-letter.txt' })
  await expect(letterRow).toContainText('from Library / Attic')
  await letterRow.getByRole('button', { name: 'More actions for old-letter.txt' }).click()
  await page.getByRole('menuitem', { name: 'Delete forever' }).click()
  const confirm = page.getByRole('dialog', { name: 'Delete “old-letter.txt” forever?' })
  await confirm.getByRole('button', { name: 'Delete forever' }).click()
  await expect(letterRow).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: 'draft.txt' })).toBeVisible()

  await page.getByRole('button', { name: 'Empty Trash' }).click()
  await page.getByRole('dialog', { name: 'Empty Trash?' }).getByRole('button', { name: 'Empty Trash' }).click()
  await expect(page.getByText('Trash is empty')).toBeVisible()
})
