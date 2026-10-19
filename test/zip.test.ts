import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { expect, it } from 'vitest'
import yauzl from 'yauzl'
import type { WalkEntry } from '../server/modules/library'
import { zipStream } from '../server/modules/zip'

const blobs: Record<string, string> = { h1: 'hello world', h2: 'second file, a bit longer' }
const opened: string[] = []
const open = async (hash: string) => {
  opened.push(hash)
  return Readable.from([Buffer.from(blobs[hash]!)])
}

const when = new Date('2026-10-01T12:00:00Z')
const entries: WalkEntry[] = [
  { path: 'Trip', kind: 'folder', blobHash: null, size: null, updatedAt: when },
  { path: 'Trip/Empty', kind: 'folder', blobHash: null, size: null, updatedAt: when },
  { path: 'Trip/notes.txt', kind: 'file', blobHash: 'h1', size: 11, updatedAt: when },
  { path: 'Übersicht.txt', kind: 'file', blobHash: 'h2', size: 25, updatedAt: when },
]

function unzip(data: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      const out: Record<string, string> = {}
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith('/')) {
          out[entry.fileName] = ''
          return zip.readEntry()
        }
        zip.openReadStream(entry, async (e, stream) => {
          if (e) return reject(e)
          out[entry.fileName] = (await buffer(stream)).toString()
          zip.readEntry()
        })
      })
      zip.on('end', () => resolve(out))
      zip.readEntry()
    })
  })
}

it('zips folders and files with their paths, opening blobs one at a time', async () => {
  const stream = zipStream(entries, open)
  // Files are opened one at a time as the zip reaches them, never all up front.
  expect(opened.length).toBeLessThanOrEqual(1)
  const contents = await unzip(await buffer(stream))
  expect(contents).toEqual({
    'Trip/': '',
    'Trip/Empty/': '',
    'Trip/notes.txt': 'hello world',
    'Übersicht.txt': 'second file, a bit longer',
  })
})
