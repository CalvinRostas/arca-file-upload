import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { signInAsAdmin } from './support'

test.describe.configure({ mode: 'serial' })

const exact = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tile = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^Open (folder )?${exact(name)}$`) })

async function uploadFiles(page: Page, paths: string[]) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Files' }).click()
  await (await chooser).setFiles(paths)
}

test('tag files, search with the query language and chips, and jump there with ⌘K', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'arca-search-'))
  const files = ['receipt-amazon.pdf', 'receipt-ikea.pdf', 'holiday-plan.txt'].map((name) => join(dir, name))
  for (const path of files) await writeFile(path, `content of ${path}`)

  await signInAsAdmin(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Finance')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tile(page, 'Finance').click()
  await expect(page.getByRole('heading', { name: 'Finance', level: 1 })).toBeVisible()
  await uploadFiles(page, files)
  await expect(tile(page, 'holiday-plan.txt')).toBeVisible()

  // Tag two files at once; create the tag on the way.
  await page.getByRole('checkbox', { name: 'Select receipt-amazon.pdf' }).click()
  await page.getByRole('checkbox', { name: 'Select receipt-ikea.pdf' }).click()
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Tags…' }).click()
  await page.getByRole('textbox', { name: 'Find or create a tag' }).fill('taxes 2025')
  await page.getByRole('button', { name: 'Create tag “taxes 2025”' }).click()
  await expect(page.getByRole('checkbox', { name: /taxes 2025/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Done' }).click()

  // The sidebar lists it with a count; clicking it searches by tag.
  const sidebarTag = page.getByRole('link', { name: /taxes 2025\s*2/ })
  await expect(sidebarTag).toBeVisible()
  await sidebarTag.click()
  await expect(page).toHaveURL(/\/search\?q=tag/)
  await expect(page.getByText('2 results')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove filter taxes 2025' })).toBeVisible()

  // A typo plus a type filter, typed into the box.
  await page.getByRole('searchbox', { name: 'Search your library' }).fill('recipt type:pdf')
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('2 results')).toBeVisible()
  await expect(page.getByText('Library / Finance').first()).toBeVisible()

  // Removing the chip edits the query text.
  await page.getByRole('button', { name: 'Remove filter PDFs' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search your library' })).toHaveValue('recipt')

  // Unknown tag is explained, not silently empty.
  await page.getByRole('searchbox', { name: 'Search your library' }).fill('tag:nope')
  await page.getByRole('search').getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('You don’t have a tag called “nope”.')).toBeVisible()

  // ⌘K: type, pick a file, land in its folder with the viewer open.
  await page.goto('/')
  const palette = page.getByRole('dialog', { name: 'Search and go to' })
  // The shortcut is listened for once the page has hydrated; ⌘K toggles, so only press while closed.
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('ControlOrMeta+k')
    await expect(palette).toBeVisible({ timeout: 1000 })
  }).toPass()
  await palette.getByRole('combobox', { name: 'Search' }).fill('holidy')
  await expect(palette.getByRole('option', { name: /holiday-plan\.txt/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/folders\/.+\?open=/)
  const viewer = page.getByRole('dialog', { name: 'holiday-plan.txt' })
  await expect(viewer.getByText(/content of .*holiday-plan\.txt/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Finance', level: 1 })).toBeVisible()

  // Rename the tag from the sidebar editor.
  await page.getByRole('button', { name: 'Edit tags' }).click()
  const nameBox = page.getByRole('textbox', { name: 'Name of tag taxes 2025' })
  await nameBox.fill('Taxes')
  await nameBox.press('Enter')
  await page.getByRole('radio', { name: 'rose' }).first().click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('link', { name: /^Taxes\s*2$/ })).toBeVisible()
})
