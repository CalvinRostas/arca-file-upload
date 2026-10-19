import { createHash, type Hash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type http from 'node:http'
import { join } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { FileStore } from '@tus/file-store'

interface Running {
  hash: Hash
  bytes: number
}

/**
 * tus FileStore that hashes chunks as they stream to disk, so a 10 GB upload doesn't need a
 * second full read at the end. If the running hash can't be trusted (server restarted
 * mid-upload, a chunk failed half-way), `digest` falls back to re-reading the file.
 */
export class HashingFileStore extends FileStore {
  private running = new Map<string, Running>()

  override async write(readable: http.IncomingMessage | Readable, id: string, offset: number): Promise<number> {
    let state = this.running.get(id)
    if (offset === 0) {
      state = { hash: createHash('sha256'), bytes: 0 }
      this.running.set(id, state)
    } else if (state && state.bytes !== offset) {
      state = undefined
      this.running.delete(id)
    }

    const tap = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (state) {
          state.hash.update(chunk)
          state.bytes += chunk.length
        }
        done(null, chunk)
      },
    })
    readable.pipe(tap)
    readable.on('error', (error) => tap.destroy(error))

    try {
      const newOffset = await super.write(tap, id, offset)
      if (state && state.bytes !== newOffset) this.running.delete(id)
      return newOffset
    } catch (error) {
      this.running.delete(id)
      throw error
    }
  }

  /** Path of an upload's bytes on disk. */
  pathOf(id: string): string {
    return join(this.directory, id)
  }

  /** SHA-256 of a finished upload: the streamed digest when it covers every byte, else re-read. */
  async digest(id: string, size: number): Promise<string> {
    const state = this.running.get(id)
    this.running.delete(id)
    if (state && state.bytes === size) return state.hash.digest('hex')
    const hash = createHash('sha256')
    await pipeline(createReadStream(this.pathOf(id)), hash)
    return hash.digest('hex')
  }

  /** Forget an upload whose bytes have been moved elsewhere. */
  async forget(id: string): Promise<void> {
    this.running.delete(id)
    await this.configstore.delete(id)
  }
}
