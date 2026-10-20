import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema, type Database } from '../server/db'
import { createLocalBlobStore, type BlobStore } from '../server/modules/blob-store'
import { createJobs, type Jobs } from '../server/modules/jobs'
import { createLibrary, type OwnerLibrary } from '../server/modules/library'
import { createPreviews, type Previews } from '../server/modules/previews'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let dir: string
let blobs: BlobStore
let jobs: Jobs
let previews: Previews
let library: OwnerLibrary

beforeEach(async () => {
  database = await freshDatabase()
  dir = await mkdtemp(join(tmpdir(), 'arca-previews-'))
  blobs = createLocalBlobStore(join(dir, 'blobs'))
  jobs = createJobs({ db: database.db, log: () => {} })
  previews = createPreviews({ db: database.db, blobStore: blobs, jobs, dir: join(dir, 'previews') })
  library = createLibrary({ db: database.db }).for(await makeUser(database.db))
})
afterEach(async () => {
  await database.close()
  await rm(dir, { recursive: true, force: true })
})

/** Store bytes as a File, the way Ingest would. */
async function store(name: string, bytes: Buffer, mimeType: string) {
  const hash = createHash('sha256').update(bytes).digest('hex')
  const staged = join(dir, `staged-${hash}`)
  await writeFile(staged, bytes)
  await blobs.adopt(staged, hash)
  await library.addFile(null, { name, blob: { hash, size: bytes.length }, mimeType }, 'keepBoth')
  return hash
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#2c7a6b' } })
    .png()
    .toBuffer()

describe('previews', () => {
  it('makes a WebP thumbnail no larger than 640px on its long edge', async () => {
    const hash = await store('wide.png', await png(2000, 1000), 'image/png')
    await previews.request(hash, 'image/png')
    expect(await previews.renditionPath(hash)).toBeNull() // not until the job ran
    await jobs.runDue()

    const path = await previews.renditionPath(hash)
    const meta = await sharp(path!).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 640, height: 320 })
  })

  it('never enlarges small images', async () => {
    const hash = await store('tiny.png', await png(40, 30), 'image/png')
    await previews.request(hash, 'image/png')
    await jobs.runDue()
    expect(await sharp((await previews.renditionPath(hash))!).metadata()).toMatchObject({ width: 40, height: 30 })
  })

  it('ignores files that aren’t images', async () => {
    const hash = await store('notes.txt', Buffer.from('hello'), 'text/plain')
    await previews.request(hash, 'text/plain')
    expect(await jobs.runDue()).toBe(0)
  })

  it('gives up quietly, once, on bytes that don’t decode', async () => {
    const hash = await store('broken.png', Buffer.from('not really a png'), 'image/png')
    await previews.request(hash, 'image/png')
    await jobs.runDue()
    expect(await previews.renditionPath(hash)).toBeNull()
    expect(await database.db.select().from(schema.job)).toEqual([]) // no retry loop
    expect((await database.db.select().from(schema.preview))[0]).toMatchObject({ status: 'failed' })
  })

  it('makes one thumbnail per Blob, however many Files share it', async () => {
    const bytes = await png(100, 100)
    const hash = await store('a.png', bytes, 'image/png')
    await store('b.png', bytes, 'image/png')
    await previews.request(hash, 'image/png')
    await previews.request(hash, 'image/png')
    expect(await jobs.runDue()).toBe(1)
  })

  it('backfills images that never got a thumbnail', async () => {
    const one = await store('one.png', await png(10, 10), 'image/png')
    await store('two.txt', Buffer.from('x'), 'text/plain')
    expect(await previews.backfill()).toBe(1)
    await jobs.runDue()
    expect(await previews.renditionPath(one)).not.toBeNull()
    expect(await previews.backfill()).toBe(0)
  })
})

// sharp can't encode HEIC, so this needs a real sample (ARCA_HEIC_SAMPLE). Reported as skipped without one.
const heicSample = await readFile(process.env.ARCA_HEIC_SAMPLE ?? '/tmp/arca-heic-sample/sample.heic').catch(() => null)

describe('formats browsers can’t show', () => {
  it.skipIf(!heicSample)('decodes HEIC and also makes a large copy for the viewer', async () => {
    const sample = heicSample!
    const hash = await store('IMG_0001.HEIC', sample, 'image/heic')
    await previews.request(hash, 'image/heic')
    await jobs.runDue()
    const thumb = await sharp((await previews.renditionPath(hash, 'thumb'))!).metadata()
    const view = await sharp((await previews.renditionPath(hash, 'view'))!).metadata()
    expect(thumb).toMatchObject({ format: 'webp', width: 640 })
    expect(view).toMatchObject({ format: 'webp', width: 1280 }) // never enlarged
  })

  it('makes a viewing copy for TIFF but not for JPEG', async () => {
    const tiff = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#5b8db8' } })
      .tiff()
      .toBuffer()
    const tiffHash = await store('scan.tiff', tiff, 'image/tiff')
    const jpgHash = await store('photo.jpg', await png(3000, 2000), 'image/jpeg')
    await previews.request(tiffHash, 'image/tiff')
    await previews.request(jpgHash, 'image/jpeg')
    await jobs.runDue()
    expect(await sharp((await previews.renditionPath(tiffHash, 'view'))!).metadata()).toMatchObject({ width: 2048 })
    expect(await previews.renditionPath(jpgHash, 'view')).toBeNull()
  })
})
