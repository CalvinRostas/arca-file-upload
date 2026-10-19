import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { text } from 'node:stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalBlobStore, type BlobStore } from '../server/modules/blob-store'

let dir: string
let store: BlobStore

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function staged(content: string) {
  const path = join(dir, `staged-${Math.random()}`)
  await writeFile(path, content)
  return path
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arca-blobs-'))
  store = createLocalBlobStore(join(dir, 'blobs'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('local blob store', () => {
  it('adopts a staged file and serves it back', async () => {
    const hash = sha('hello world')
    await store.adopt(await staged('hello world'), hash)
    expect(await store.has(hash)).toBe(true)
    expect(await text(await store.open(hash))).toBe('hello world')
  })

  it('serves byte ranges (inclusive)', async () => {
    const hash = sha('0123456789')
    await store.adopt(await staged('0123456789'), hash)
    expect(await text(await store.open(hash, { start: 2, end: 5 }))).toBe('2345')
  })

  it('keeps one copy when the same bytes arrive twice', async () => {
    const hash = sha('same')
    await store.adopt(await staged('same'), hash)
    const second = await staged('same')
    await store.adopt(second, hash)
    expect((await readdir(dir)).filter((f) => f.startsWith('staged-'))).toEqual([])
  })

  it('deletes', async () => {
    const hash = sha('bye')
    await store.adopt(await staged('bye'), hash)
    await store.delete(hash)
    expect(await store.has(hash)).toBe(false)
    await expect(store.open(hash)).rejects.toThrow()
  })

  it('rejects anything that is not a hash', async () => {
    await expect(store.open('../../etc/passwd')).rejects.toThrow(/SHA-256/)
  })
})
