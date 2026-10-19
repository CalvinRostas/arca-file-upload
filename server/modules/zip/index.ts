import type { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import type { WalkEntry } from '../library'

/**
 * Stream a zip of walked Library entries. Nothing is buffered or written to disk: each File's
 * bytes are opened only when the zip reaches it. No compression (photos and videos don't
 * shrink, and storing is fast); ZIP64 kicks in automatically past 4 GB.
 */
export function zipStream(entries: WalkEntry[], open: (blobHash: string) => Promise<Readable>): Readable {
  const zip = new ZipFile()
  for (const entry of entries) {
    if (entry.kind === 'folder') {
      zip.addEmptyDirectory(entry.path, { mtime: entry.updatedAt })
      continue
    }
    zip.addReadStreamLazy(entry.path, { compress: false, size: entry.size ?? 0, mtime: entry.updatedAt }, (done) => {
      open(entry.blobHash!).then(
        (stream) => done(null, stream),
        (error: Error) => done(error, null as never),
      )
    })
  }
  zip.end()
  return zip.outputStream as Readable
}
