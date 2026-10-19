import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'

/** Inclusive byte range, as in an HTTP `Range` header. */
export interface ByteRange {
  start: number
  end: number
}

/**
 * Where Blob bytes live (the one real seam: local disk now, S3/R2 later). Content-addressed:
 * a hash names exactly one immutable byte sequence.
 */
export interface BlobStore {
  /**
   * Take ownership of a fully written file whose SHA-256 is `hash`. The file is moved (or,
   * if those bytes are already stored, deleted). Idempotent.
   */
  adopt(tempFile: string, hash: string): Promise<void>
  /** Stream the bytes, or a range of them. Throws if the Blob doesn't exist. */
  open(hash: string, range?: ByteRange): Promise<Readable>
  has(hash: string): Promise<boolean>
  delete(hash: string): Promise<void>
}

const HASH = /^[0-9a-f]{64}$/

/** Blobs at `<root>/ab/cd/<hash>`, so no directory grows huge. */
export function createLocalBlobStore(root: string): BlobStore {
  function pathOf(hash: string) {
    if (!HASH.test(hash)) throw new Error(`Not a SHA-256 hex digest: ${hash}`)
    return join(root, hash.slice(0, 2), hash.slice(2, 4), hash)
  }

  async function has(hash: string) {
    try {
      await stat(pathOf(hash))
      return true
    } catch {
      return false
    }
  }

  return {
    has,

    async adopt(tempFile, hash) {
      const target = pathOf(hash)
      if (await has(hash)) {
        await rm(tempFile, { force: true })
        return
      }
      await mkdir(dirname(target), { recursive: true })
      try {
        await rename(tempFile, target)
      } catch (error) {
        // Upload staging on another filesystem: copy first, so the Blob appears whole or not at all.
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
        const partial = `${target}.partial`
        await copyFile(tempFile, partial)
        await rename(partial, target)
        await rm(tempFile, { force: true })
      }
    },

    async open(hash, range) {
      const path = pathOf(hash)
      await stat(path)
      return createReadStream(path, range ? { start: range.start, end: range.end } : undefined)
    },

    async delete(hash) {
      await rm(pathOf(hash), { force: true })
    },
  }
}
