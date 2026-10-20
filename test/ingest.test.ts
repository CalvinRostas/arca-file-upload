import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db'
import { createLocalBlobStore, type BlobStore } from '../server/modules/blob-store'
import { Unauthenticated } from '../server/modules/errors'
import { createIngest, type Ingest, type IngestResult } from '../server/modules/ingest'
import { createLibrary, type Library } from '../server/modules/library'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

const BASE = 'http://arca.test'
const PATH = '/api/uploads'

let database: Database
let dir: string
let library: Library
let blobs: BlobStore
let ingest: Ingest
let ada: { id: string }
let bob: { id: string }

function makeIngest() {
  return createIngest({
    library,
    blobStore: blobs,
    uploadDir: join(dir, 'uploads'),
    path: PATH,
    maxFileBytes: 10 * 1024 * 1024,
    async authenticate(headers) {
      const id = headers.get('x-test-user')
      if (!id) throw new Unauthenticated()
      return { id }
    },
  })
}

beforeEach(async () => {
  database = await freshDatabase()
  dir = await mkdtemp(join(tmpdir(), 'arca-ingest-'))
  library = createLibrary({ db: database.db })
  blobs = createLocalBlobStore(join(dir, 'blobs'))
  ingest = makeIngest()
  ada = await makeUser(database.db, 'Ada')
  bob = await makeUser(database.db, 'Bob')
})
afterEach(async () => {
  await database.close()
  await rm(dir, { recursive: true, force: true })
})

// ── A tiny tus client ───────────────────────────────────────────────────────

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const encodeMeta = (meta: Record<string, string>) =>
  Object.entries(meta)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',')

async function create(user: { id: string } | null, size: number, meta: Record<string, string>) {
  const headers: Record<string, string> = {
    'Tus-Resumable': '1.0.0',
    'Upload-Length': String(size),
    'Upload-Metadata': encodeMeta(meta),
  }
  if (user) headers['x-test-user'] = user.id
  const res = await ingest.handle(new Request(`${BASE}${PATH}`, { method: 'POST', headers }))
  return { res, url: new URL(res.headers.get('location') ?? '', BASE).toString() }
}

function patch(user: { id: string }, url: string, offset: number, chunk: Buffer) {
  return ingest.handle(
    new Request(url, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        'x-test-user': user.id,
      },
      body: new Uint8Array(chunk),
    }),
  )
}

async function head(user: { id: string }, url: string) {
  return ingest.handle(
    new Request(url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0', 'x-test-user': user.id } }),
  )
}

async function upload(user: { id: string }, data: Buffer, meta: Record<string, string>): Promise<IngestResult> {
  const { res, url } = await create(user, data.length, meta)
  expect(res.status).toBe(201)
  const done = await patch(user, url, 0, data)
  expect(done.status).toBe(200)
  return done.json()
}

const stagedFiles = async () => readdir(join(dir, 'uploads')).catch(() => [])

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ingest', () => {
  it('turns a finished upload into a File backed by a Blob', async () => {
    const data = randomBytes(64 * 1024)
    const result = await upload(ada, data, { filename: 'photo.jpg', filetype: 'image/jpeg' })

    expect(result).toMatchObject({
      status: 'added',
      file: { name: 'photo.jpg', size: data.length, mimeType: 'image/jpeg' },
      duplicateOf: null,
    })
    if (result.status !== 'added') throw new Error('unexpected')
    const stored = await library.for(ada).getFile(result.file.id)
    expect(stored.blobHash).toBe(sha(data))
    expect(await buffer(await blobs.open(stored.blobHash))).toEqual(data)
    expect(await stagedFiles()).toEqual([])
  })

  it('resumes across requests and survives a server restart mid-upload', async () => {
    const data = randomBytes(300 * 1024)
    const { url } = await create(ada, data.length, { filename: 'big.bin' })
    await patch(ada, url, 0, data.subarray(0, 100 * 1024))

    ingest = makeIngest() // new process: the running hash is gone
    const offset = Number((await head(ada, url)).headers.get('upload-offset'))
    expect(offset).toBe(100 * 1024)
    const done = await patch(ada, url, offset, data.subarray(offset))
    const result = (await done.json()) as IngestResult
    if (result.status !== 'added') throw new Error('unexpected')
    expect((await library.for(ada).getFile(result.file.id)).blobHash).toBe(sha(data))
  })

  it('hashes correctly when chunks arrive in several PATCHes', async () => {
    const data = randomBytes(90_000)
    const { url } = await create(ada, data.length, { filename: 'chunks.bin' })
    await patch(ada, url, 0, data.subarray(0, 30_000))
    await patch(ada, url, 30_000, data.subarray(30_000, 60_000))
    const result = (await (await patch(ada, url, 60_000, data.subarray(60_000))).json()) as IngestResult
    if (result.status !== 'added') throw new Error('unexpected')
    expect((await library.for(ada).getFile(result.file.id)).blobHash).toBe(sha(data))
  })

  it('stores identical bytes once and points out the Duplicate', async () => {
    const data = randomBytes(1024)
    await upload(ada, data, { filename: 'a.bin' })
    const second = await upload(ada, data, { filename: 'b.bin' })
    expect(second).toMatchObject({ status: 'added', duplicateOf: { name: 'a.bin', path: [] } })

    const third = await upload(bob, data, { filename: 'bobs.bin' })
    expect(third).toMatchObject({ status: 'added', duplicateOf: null })
    const shards = await readdir(join(dir, 'blobs'), { recursive: true })
    expect(shards.filter((p) => p.endsWith(sha(data)))).toHaveLength(1)
  })

  it('guesses the type from the name when the browser sends none', async () => {
    const heic = await upload(ada, randomBytes(10), { filename: 'IMG_0042.HEIC' })
    const odd = await upload(ada, randomBytes(10), { filename: 'notes.weird' })
    const trusted = await upload(ada, randomBytes(10), { filename: 'x.heic', filetype: 'application/x-custom' })
    expect(heic).toMatchObject({ file: { mimeType: 'image/heic' } })
    expect(odd).toMatchObject({ file: { mimeType: null } })
    expect(trusted).toMatchObject({ file: { mimeType: 'application/x-custom' } })
  })

  it('creates the Folders of a folder upload', async () => {
    const result = await upload(ada, randomBytes(10), { filename: 'a.jpg', relativeDir: 'Trip/Day 1' })
    if (result.status !== 'added') throw new Error('unexpected')
    const listing = await library.for(ada).list(result.file.parentId)
    expect(listing.path.map((c) => c.name)).toEqual(['Trip', 'Day 1'])
  })

  it('applies the collision choice when the upload finishes', async () => {
    const folder = await library.for(ada).createFolder(null, 'Docs')
    await upload(ada, Buffer.from('v1'), { filename: 'report.pdf', folderId: folder.id })

    const replaced = await upload(ada, Buffer.from('v2'), {
      filename: 'report.pdf',
      folderId: folder.id,
      onConflict: 'replace',
    })
    expect(replaced).toMatchObject({ status: 'added', replaced: true, file: { name: 'report.pdf' } })

    const skipped = await upload(ada, Buffer.from('v3'), {
      filename: 'report.pdf',
      folderId: folder.id,
      onConflict: 'skip',
    })
    expect(skipped).toEqual({ status: 'skipped' })

    const kept = await upload(ada, Buffer.from('v4'), { filename: 'report.pdf', folderId: folder.id })
    expect(kept).toMatchObject({ status: 'added', file: { name: 'report (1).pdf' } })
  })

  it('requires a signed-in user', async () => {
    const { res } = await create(null, 10, { filename: 'x' })
    expect(res.status).toBe(401)
  })

  it('refuses uploads into someone else’s Folder', async () => {
    const theirs = await library.for(bob).createFolder(null, 'Bob only')
    const { res } = await create(ada, 10, { filename: 'x', folderId: theirs.id })
    expect(res.status).toBe(404)
  })

  it('hides one owner’s upload from another', async () => {
    const { url } = await create(ada, 10, { filename: 'x' })
    expect((await head(bob, url)).status).toBe(404)
    expect((await patch(bob, url, 0, Buffer.alloc(10))).status).toBe(404)
    expect((await head(ada, url)).status).toBe(200)
  })

  it('ignores an ownerId smuggled in by the client', async () => {
    const result = await upload(ada, randomBytes(10), { filename: 'mine.txt', ownerId: bob.id })
    expect(result.status).toBe('added')
    expect((await library.for(bob).list(null)).items).toEqual([])
    expect((await library.for(ada).list(null)).items.map((i) => i.name)).toEqual(['mine.txt'])
  })

  it('rejects files over the size limit', async () => {
    const { res } = await create(ada, 11 * 1024 * 1024, { filename: 'huge.bin' })
    expect(res.status).toBe(413)
  })

  it('cleans up uploads that stopped making progress', async () => {
    const { url: idle } = await create(ada, 100, { filename: 'idle.bin' })
    await patch(ada, idle, 0, Buffer.alloc(10))
    const { url: active } = await create(ada, 100, { filename: 'active.bin' })
    await patch(ada, active, 0, Buffer.alloc(10))

    const idleId = idle.split('/').pop()!
    const longAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000)
    await utimes(join(dir, 'uploads', idleId), longAgo, longAgo)

    expect(await ingest.cleanupAbandoned(24 * 3600 * 1000)).toBe(1)
    expect((await head(ada, idle)).status).toBe(404)
    expect((await head(ada, active)).status).toBe(200)
  })
})
