import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { and, eq, isNull, sql } from 'drizzle-orm'
import heicConvert from 'heic-convert'
import sharp, { type Sharp } from 'sharp'
import { schema, type Db } from '../../db'
import type { BlobStore } from '../blob-store'
import type { Jobs } from '../jobs'

const { preview, item, blob } = schema

/** What we can render. HEIC/HEIF (iPhone photos) go through heic-convert first. */
const THUMBNAILABLE = /^image\/(jpeg|png|webp|gif|avif|tiff|svg\+xml|heic|heif)$/
/** Browsers can't show these originals, so they also get a large rendition for the viewer. */
const NEEDS_VIEW_RENDITION = /^image\/(tiff|heic|heif)$/
const HEIF = /^image\/hei[cf]$/
/** HEIC decoding needs the whole file in memory; phone photos are a few MB. */
const MAX_HEIC_BYTES = 100 * 1024 * 1024

export type PreviewSize = 'thumb' | 'view'
const EDGE: Record<PreviewSize, number> = { thumb: 640, view: 2048 }
const JOB = 'preview'

export interface PreviewsConfig {
  db: Db
  blobStore: BlobStore
  jobs: Jobs
  /** Where renditions are cached. Derived data: safe to delete, it will be regenerated. */
  dir: string
}

/**
 * Thumbnails (and, for formats browsers can't show, a large viewing copy) generated in the
 * background and keyed by Blob, so identical bytes share one Preview.
 */
export function createPreviews({ db, blobStore, jobs, dir }: PreviewsConfig) {
  const pathOf = (hash: string, size: PreviewSize) =>
    join(dir, hash.slice(0, 2), size === 'thumb' ? `${hash}.webp` : `${hash}.view.webp`)

  /** A sharp pipeline over the Blob's bytes, decoding HEIC first when needed. */
  async function source(hash: string, mimeType: string): Promise<Sharp> {
    const options = { failOn: 'none' as const, animated: false, limitInputPixels: 268_402_689 }
    if (HEIF.test(mimeType)) {
      const bytes = await buffer(await blobStore.open(hash))
      if (bytes.length > MAX_HEIC_BYTES) throw new Error('HEIC too large to decode')
      const jpeg = await heicConvert({ buffer: bytes, format: 'JPEG', quality: 0.92 })
      return sharp(Buffer.from(jpeg), options)
    }
    const transform = sharp(options)
    const input = await blobStore.open(hash) // I/O errors throw: the job retries
    input.on('error', (error) => transform.destroy(error))
    input.pipe(transform)
    return transform
  }

  async function render(image: Sharp, size: PreviewSize, target: string) {
    const partial = `${target}.partial`
    try {
      return await image
        .rotate() // honour EXIF orientation
        .resize(EDGE[size], EDGE[size], { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size === 'thumb' ? 74 : 82 })
        .toFile(partial)
        .then(async (info) => {
          await rename(partial, target)
          return info
        })
    } finally {
      await rm(partial, { force: true })
    }
  }

  async function generate(hash: string, mimeType: string) {
    const [existing] = await db.select().from(preview).where(eq(preview.blobHash, hash))
    if (existing) return
    const [stored] = await db.select({ hash: blob.hash }).from(blob).where(eq(blob.hash, hash))
    if (!stored) return // collected (Blob GC) before we got to it
    await mkdir(dirname(pathOf(hash, 'thumb')), { recursive: true })

    try {
      const image = await source(hash, mimeType)
      const sizes: PreviewSize[] = NEEDS_VIEW_RENDITION.test(mimeType) ? ['thumb', 'view'] : ['thumb']
      // clone() lets one decode feed several outputs.
      const [thumb] = await Promise.all(sizes.map((size) => render(image.clone(), size, pathOf(hash, size))))
      await db
        .insert(preview)
        .values({ blobHash: hash, status: 'ready', width: thumb!.width, height: thumb!.height })
        .onConflictDoNothing()
    } catch {
      // Undecodable or unsupported content: remember, so we don't try again.
      await db.insert(preview).values({ blobHash: hash, status: 'failed' }).onConflictDoNothing()
    }
  }

  jobs.register(JOB, async (payload) => generate(String(payload.hash), String(payload.mimeType ?? '')))

  async function request(hash: string, mimeType: string | null) {
    if (!mimeType || !THUMBNAILABLE.test(mimeType)) return
    await jobs.enqueue(JOB, { hash, mimeType }, { dedupeKey: `${JOB}:${hash}` })
  }

  return {
    request,

    /** Path of a ready rendition (WebP), or null if there isn't one (yet). */
    async renditionPath(hash: string, size: PreviewSize = 'thumb'): Promise<string | null> {
      const [row] = await db.select().from(preview).where(eq(preview.blobHash, hash))
      if (row?.status !== 'ready') return null
      const path = pathOf(hash, size)
      return stat(path)
        .then(() => path)
        .catch(() => null)
    },

    /** Delete a Blob's renditions (Blob GC). Its `preview` row goes with the Blob row. */
    async forget(hash: string): Promise<void> {
      await Promise.all((['thumb', 'view'] as const).map((size) => rm(pathOf(hash, size), { force: true })))
    },

    /** Ask for previews of every renderable File that has none yet (e.g. after an upgrade). */
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

export type Previews = ReturnType<typeof createPreviews>
