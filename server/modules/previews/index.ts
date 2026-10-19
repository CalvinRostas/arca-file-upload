import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { and, eq, isNull, sql } from 'drizzle-orm'
import sharp, { type Sharp } from 'sharp'
import { schema, type Db } from '../../db'
import type { BlobStore } from '../blob-store'
import type { Jobs } from '../jobs'

const { preview, item } = schema

/** Formats sharp's prebuilt binaries can decode. HEIC (iPhone photos) isn't one of them yet. */
const THUMBNAILABLE = /^image\/(jpeg|png|webp|gif|avif|tiff|svg\+xml)$/
const MAX_EDGE = 640
const JOB = 'preview'

export interface PreviewsConfig {
  db: Db
  blobStore: BlobStore
  jobs: Jobs
  /** Where thumbnails are cached. Derived data: safe to delete, it will be regenerated. */
  dir: string
}

/**
 * Thumbnails for Files, generated in the background and keyed by Blob, so identical bytes
 * share one Preview. Callers ask for one after an Upload and read it back by hash.
 */
export function createPreviews({ db, blobStore, jobs, dir }: PreviewsConfig) {
  const pathOf = (hash: string) => join(dir, hash.slice(0, 2), `${hash}.webp`)

  async function generate(hash: string) {
    const [existing] = await db.select().from(preview).where(eq(preview.blobHash, hash))
    if (existing) return

    const target = pathOf(hash)
    const partial = `${target}.partial`
    await mkdir(dirname(target), { recursive: true })
    const input = await blobStore.open(hash) // I/O errors throw: the job retries

    const transform = sharp({ failOn: 'none', animated: false })
      .rotate() // honour EXIF orientation
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 74 })
    try {
      const info = await toFile(input, transform, partial)
      await rename(partial, target)
      await db
        .insert(preview)
        .values({ blobHash: hash, status: 'ready', width: info.width, height: info.height })
        .onConflictDoNothing()
    } catch {
      // Undecodable or unsupported content: remember, so we don't try again.
      await rm(partial, { force: true })
      await db.insert(preview).values({ blobHash: hash, status: 'failed' }).onConflictDoNothing()
    }
  }

  jobs.register(JOB, async (payload) => generate(String(payload.hash)))

  async function request(hash: string, mimeType: string | null) {
    if (!mimeType || !THUMBNAILABLE.test(mimeType)) return
    await jobs.enqueue(JOB, { hash }, { dedupeKey: `${JOB}:${hash}` })
  }

  return {
    request,

    /** Path of a ready thumbnail (WebP), or null if there isn't one (yet). */
    async thumbnailPath(hash: string): Promise<string | null> {
      const [row] = await db.select().from(preview).where(eq(preview.blobHash, hash))
      if (row?.status !== 'ready') return null
      return stat(pathOf(hash))
        .then(() => pathOf(hash))
        .catch(() => null)
    },

    /** Ask for thumbnails of every thumbnailable File that has none yet (e.g. after an upgrade). */
    async backfill(): Promise<number> {
      const rows = await db
        .selectDistinct({ hash: item.blobHash, mimeType: item.mimeType })
        .from(item)
        .leftJoin(preview, eq(preview.blobHash, item.blobHash))
        .where(and(eq(item.kind, 'file'), isNull(preview.blobHash), sql`${item.mimeType} ~ ${THUMBNAILABLE.source}`))
      for (const row of rows) await request(row.hash!, row.mimeType)
      return rows.length
    },
  }
}

function toFile(input: Readable, transform: Sharp, path: string) {
  input.on('error', (error) => transform.destroy(error))
  input.pipe(transform)
  return transform.toFile(path)
}

export type Previews = ReturnType<typeof createPreviews>
