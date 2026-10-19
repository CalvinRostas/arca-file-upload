import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import yauzl from 'yauzl'
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

function zipNames(path: string): Promise<string[]> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: false }, (err, zip) => {
      if (err) return reject(err)
      const names: string[] = []
      zip.on('entry', (e: yauzl.Entry) => names.push(e.fileName))
      zip.on('end', () => resolve(names.sort()))
    }),
  )
}

test('thumbnails, viewer, list view, selection, move, and zip', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'arca-browse-'))
  const photo = join(dir, 'sunset.png')
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c09a45' } })
    .png()
    .toFile(photo)
  const notes = join(dir, 'notes.txt')
  await writeFile(notes, 'Bring sunscreen <b>not html</b>')

  await signInAsAdmin(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Holiday')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tile(page, 'Holiday').click()
  await expect(page.getByRole('heading', { name: 'Holiday', level: 1 })).toBeVisible()
  await uploadFiles(page, [photo, notes])
  await expect(tile(page, 'notes.txt')).toBeVisible()

  // The thumbnail is generated in the background and shows up after a refresh.
  await expect
    .poll(
      async () => {
        await page.reload()
        return tile(page, 'sunset.png').locator('img').count()
      },
      { timeout: 20_000 },
    )
    .toBe(1)

  // Viewer: image, then arrow to the text file, which shows as text (not HTML).
  await tile(page, 'notes.txt').click()
  const viewer = page.getByRole('dialog')
  await expect(viewer.getByText('Bring sunscreen <b>not html</b>')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByRole('img', { name: 'sunset.png' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)

  // The folder tile in the library shows a mosaic.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Library' }).click()
  await expect(tile(page, 'Holiday').locator('img')).toHaveCount(1)

  // List view is remembered.
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Kind')).toBeVisible() // the list header
  await page.getByRole('button', { name: 'Grid', exact: true }).click()

  // Select both files, move them into a new folder.
  await page.getByRole('button', { name: 'New folder' }).click()
  await page.getByRole('textbox', { name: 'Name' }).fill('Archive')
  await page.getByRole('button', { name: 'Create folder' }).click()
  await tile(page, 'Holiday').click()
  await expect(page.getByRole('heading', { name: 'Holiday', level: 1 })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select notes.txt' }).click()
  await tile(page, 'sunset.png').click() // while selecting, a click selects
  await expect(page.getByText('2 selected')).toBeVisible()
  await page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name: 'Move to…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move 2 items' })
  await dialog.getByRole('button', { name: 'Library', exact: true }).click()
  await dialog.getByRole('button', { name: 'Archive', exact: true }).click()
  await dialog.getByRole('button', { name: 'Move to Archive' }).click()
  await expect(page.getByText('This folder is empty')).toBeVisible()

  // Zip of a folder, from its menu.
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Library' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Actions for Archive' }).click()
  await page.getByRole('menuitem', { name: 'Download as zip' }).click()
  const zip = await download
  expect(zip.suggestedFilename()).toBe('Archive.zip')
  expect(await zipNames(await zip.path())).toEqual(['Archive/', 'Archive/notes.txt', 'Archive/sunset.png'])
  expect((await readFile(await zip.path())).length).toBeGreaterThan(1000)
})
