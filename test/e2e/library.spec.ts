import { createHash, randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { signInAsAdmin } from './support'

test.describe.configure({ mode: 'serial' })

let dir: string
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arca-e2e-'))
})

async function writeTemp(name: string, data: Buffer | string) {
  const path = join(dir, name)
  await writeFile(path, data)
  return path
}

async function uploadFiles(page: Page, paths: string[]) {
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Files' }).click()
  await (await chooser).setFiles(paths)
}

const tile = (page: Page, name: string) => page.getByRole('link', { name, exact: false }).filter({ hasText: name })

test('folders, uploads, collisions, duplicates, downloads', async ({ page }) => {
  await signInAsAdmin(page)
  await page.goto('/')

  // New folder, then into it.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Taxes')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await page.getByRole('link', { name: /Taxes/ }).click()
  await expect(page.getByRole('heading', { name: 'Taxes', level: 1 })).toBeVisible()
  await expect(page.getByText('This folder is empty')).toBeVisible()

  // Upload a file.
  const report = await writeTemp('report.pdf', 'version one')
  await uploadFiles(page, [report])
  await expect(page.getByText('Saved to Taxes')).toBeVisible()
  await expect(tile(page, 'report.pdf')).toBeVisible()

  // Same name again → asked; keep both.
  const report2 = await writeTemp('report.pdf', 'version two')
  await uploadFiles(page, [report2])
  await expect(page.getByRole('heading', { name: '“report.pdf” is already in Taxes' })).toBeVisible()
  await page.getByRole('button', { name: /Keep both/ }).click()
  await expect(tile(page, 'report (1).pdf')).toBeVisible()

  // Replace.
  const report3 = await writeTemp('report.pdf', 'version three')
  await uploadFiles(page, [report3])
  await page.getByRole('button', { name: /Replace/ }).click()
  await expect(page.getByText('Replaced the file in Taxes')).toBeVisible()

  // Download returns the replaced content.
  const download = page.waitForEvent('download')
  await tile(page, 'report.pdf').first().click()
  expect(await readFile(await (await download).path())).toEqual(Buffer.from('version three'))

  // Identical bytes under another name → Duplicate notice → discard.
  const copy = await writeTemp('copy-of-report.pdf', 'version three')
  await uploadFiles(page, [copy])
  const notice = page.getByRole('status').filter({ hasText: 'is the same as' })
  await expect(notice).toContainText('copy-of-report.pdf is the same as report.pdf in Taxes')
  await notice.getByRole('button', { name: 'Discard this copy' }).click()
  await expect(notice).toHaveCount(0)
  await expect(tile(page, 'copy-of-report.pdf')).toHaveCount(0)

  // Rename.
  await page.getByRole('button', { name: 'Actions for report (1).pdf' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('report-draft.pdf')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(tile(page, 'report-draft.pdf')).toBeVisible()

  // Breadcrumb back to the library.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
})

test('folder upload keeps the structure', async ({ page }) => {
  await signInAsAdmin(page)
  await page.goto('/')
  const root = join(dir, 'Trip')
  await mkdir(join(root, 'Day 1'), { recursive: true })
  await writeFile(join(root, 'Day 1', 'beach.jpg'), randomBytes(2000))
  await writeFile(join(root, 'notes.txt'), 'packing list')
  await writeFile(join(root, '.DS_Store'), 'junk')

  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Folder' }).click()
  await (await chooser).setFiles(root)

  await page.getByRole('link', { name: /Trip/ }).click()
  await expect(tile(page, 'notes.txt')).toBeVisible()
  await expect(tile(page, '.DS_Store')).toHaveCount(0)
  await page.getByRole('link', { name: /Day 1/ }).click()
  await expect(tile(page, 'beach.jpg')).toBeVisible()
})

test('a big upload can be paused and resumed, and survives a reload', async ({ page }) => {
  await signInAsAdmin(page)
  const data = randomBytes(4 * 1024 * 1024) // 16 chunks of 256 KB in this test setup
  const big = await writeTemp('big.bin', data)

  // Slow the chunks down so there's time to pause and reload mid-upload.
  await page.route('**/api/uploads/**', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 250))
    await route.continue()
  })

  await page.goto('/')
  await uploadFiles(page, [big])
  const panel = page.getByRole('complementary', { name: 'Uploads' })
  await expect(panel.getByRole('button', { name: 'Pause big.bin' })).toBeVisible()

  await panel.getByRole('button', { name: 'Pause big.bin' }).click()
  await expect(panel.getByText(/Paused at/)).toBeVisible()
  await panel.getByRole('button', { name: 'Resume big.bin' }).click()

  // Reload mid-upload: the upload is remembered as interrupted.
  await expect
    .poll(async () => Number(await panel.getByRole('progressbar').getAttribute('aria-valuenow')))
    .toBeGreaterThan(25)
  await page.reload()
  await expect(panel.getByText('Interrupted. Select the file again')).toBeVisible()
  const progressBefore = Number(await panel.getByRole('progressbar').getAttribute('aria-valuenow'))
  expect(progressBefore).toBeGreaterThan(0)

  const offsetsAfterReload: number[] = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH') offsetsAfterReload.push(Number(request.headers()['upload-offset']))
  })
  const chooser = page.waitForEvent('filechooser')
  await panel.getByRole('button', { name: 'Select file' }).click()
  await (await chooser).setFiles(big)
  await expect(panel.getByText('Saved to Library')).toBeVisible({ timeout: 30_000 })
  // It continued where it stopped instead of starting over.
  expect(Math.min(...offsetsAfterReload)).toBeGreaterThan(0)

  const download = page.waitForEvent('download')
  await tile(page, 'big.bin').click()
  expect(sha(await readFile(await (await download).path()))).toBe(sha(data))
})
