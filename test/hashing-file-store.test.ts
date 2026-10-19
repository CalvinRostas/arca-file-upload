import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { Upload } from '@tus/utils'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { HashingFileStore } from '../server/modules/ingest/hashing-file-store'

// Internal seam of Ingest: proves the streamed digest is really used (not just the re-read fallback).

let dir: string
let store: HashingFileStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'arca-hash-'))
  store = new HashingFileStore({ directory: dir, expirationPeriodInMilliseconds: 0 })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')

async function staged(data: Buffer, chunks: number) {
  await store.create(new Upload({ id: 'u1', size: data.length, offset: 0 }))
  const step = Math.ceil(data.length / chunks)
  for (let offset = 0; offset < data.length; offset += step) {
    await store.write(Readable.from([data.subarray(offset, offset + step)]), 'u1', offset)
  }
}

it('digests from the stream without re-reading the file', async () => {
  const data = randomBytes(200_000)
  await staged(data, 4)
  await rm(store.pathOf('u1')) // a re-read would now fail
  expect(await store.digest('u1', data.length)).toBe(sha(data))
})

it('falls back to re-reading when the stream missed bytes', async () => {
  const data = randomBytes(50_000)
  await staged(data, 2)
  const fresh = new HashingFileStore({ directory: dir, expirationPeriodInMilliseconds: 0 })
  expect(await fresh.digest('u1', data.length)).toBe(sha(data))
})
