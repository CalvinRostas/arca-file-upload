import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Server, type Upload } from '@tus/server'
import type { BlobStore } from '../blob-store'
import { DomainError, NotFound } from '../errors'
import type { AddFileResult, ConflictChoice, Library } from '../library'
import { HashingFileStore } from './hashing-file-store'

export interface IngestConfig {
  library: Library
  blobStore: BlobStore
  /** Staging directory for in-progress Uploads. Same filesystem as the BlobStore, ideally. */
  uploadDir: string
  /** URL path the tus endpoint is mounted at, e.g. `/api/uploads`. */
  path: string
  maxFileBytes: number
  /** Resolves the signed-in Owner from request headers, or throws a DomainError. */
  authenticate(headers: Headers): Promise<{ id: string }>
  /** Called after a File is added (e.g. to request a thumbnail). Errors are logged, not thrown. */
  onFileAdded?(file: { blobHash: string; mimeType: string | null }): Promise<void>
}

/**
 * Metadata the client sends with each Upload (tus `Upload-Metadata`).
 * `ownerId` is never trusted from the client: it's overwritten on creation.
 */
interface UploadMetadata {
  filename: string
  filetype?: string
  /** Target Folder; empty means the root. */
  folderId?: string
  /** For folder uploads: Folders to create below `folderId`, joined by `/`. */
  relativeDir?: string
  onConflict?: ConflictChoice
  ownerId?: string
}

/** What the final PATCH returns as JSON, for the client to show. */
export type IngestResult = AddFileResult

const CHOICES: ConflictChoice[] = ['replace', 'keepBoth', 'skip']
const MIME = /^[\w.+-]+\/[\w.+-]+$/
/** When the browser sends no type (common for .heic), guess from the name for the formats we render. */
const MIME_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

function mimeTypeOf(filetype: string | undefined, filename: string): string | null {
  if (filetype && filetype.length <= 127 && MIME.test(filetype)) return filetype
  return MIME_BY_EXTENSION[filename.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

/** tus aborts a request when a hook throws `{ status_code, body }`. */
function fail(status_code: number, body: string) {
  return { status_code, body }
}

function asTusError(error: unknown) {
  if (error instanceof DomainError) return fail(error.status, error.message)
  return error
}

/**
 * Resumable Uploads (ADR-0002). Turns a finished tus Upload into a File in the Owner's
 * Library: streamed SHA-256, Blob dedup, the Name-collision choice re-applied at the end.
 */
export function createIngest(config: IngestConfig) {
  const store = new HashingFileStore({ directory: config.uploadDir, expirationPeriodInMilliseconds: 0 })

  async function finish(upload: Upload): Promise<IngestResult> {
    const meta = upload.metadata as unknown as UploadMetadata
    const size = upload.size ?? 0
    const hash = await store.digest(upload.id, size)
    await config.blobStore.adopt(store.pathOf(upload.id), hash)
    await store.forget(upload.id)

    const library = config.library.for({ id: meta.ownerId! })
    const segments = (meta.relativeDir ?? '').split('/').filter(Boolean)
    let folderId: string | null = meta.folderId || null
    try {
      folderId = await library.ensureFolderPath(folderId, segments)
    } catch (error) {
      // The target Folder vanished while bytes were in flight: keep the File, at the root.
      if (!(error instanceof NotFound)) throw error
      folderId = await library.ensureFolderPath(null, segments)
    }

    const mimeType = mimeTypeOf(meta.filetype, meta.filename)
    const result = await library.addFile(
      folderId,
      { name: meta.filename, blob: { hash, size }, mimeType },
      meta.onConflict ?? 'keepBoth',
    )
    if (result.status === 'added') {
      await config.onFileAdded?.({ blobHash: hash, mimeType }).catch((error) => {
        console.error('[ingest] onFileAdded failed', error)
      })
    }
    return result
  }

  const server = new Server({
    path: config.path,
    datastore: store,
    maxSize: config.maxFileBytes,
    respectForwardedHeaders: true,
    disableTerminationForFinishedUploads: true,

    async onIncomingRequest(req, uploadId) {
      try {
        const user = await config.authenticate(req.headers)
        if (req.method === 'POST') return
        const upload = await store.getUpload(uploadId).catch(() => null)
        if (upload && upload.metadata?.ownerId !== user.id) throw fail(404, 'Upload not found')
      } catch (error) {
        throw asTusError(error)
      }
    },

    async onUploadCreate(req, upload) {
      try {
        const user = await config.authenticate(req.headers)
        const meta = (upload.metadata ?? {}) as Record<string, string | null>
        if (!meta.filename) throw fail(400, 'Missing filename')
        const onConflict = (meta.onConflict ?? 'keepBoth') as ConflictChoice
        if (!CHOICES.includes(onConflict)) throw fail(400, 'Invalid onConflict')
        // Fail fast on a missing or foreign Folder instead of after the bytes arrive.
        await config.library.for(user).takenNames(meta.folderId || null, [])
        return { metadata: { ...meta, onConflict, ownerId: user.id } }
      } catch (error) {
        throw asTusError(error)
      }
    },

    async onUploadFinish(_req, upload) {
      try {
        const result = await finish(upload)
        return { status_code: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) }
      } catch (error) {
        throw asTusError(error)
      }
    },
  })

  return {
    /** Handles every tus request under `config.path`. */
    handle: (request: Request): Promise<Response> => server.handleWeb(request),

    /** Delete Uploads with no new bytes for `idleMs` (GLOSSARY: Upload). Returns how many. */
    async cleanupAbandoned(idleMs: number): Promise<number> {
      const cutoff = Date.now() - idleMs
      let removed = 0
      for (const entry of await readdir(config.uploadDir).catch(() => [])) {
        if (!entry.endsWith('.json')) continue
        const id = entry.slice(0, -'.json'.length)
        const lastWrite = await stat(join(config.uploadDir, id))
          .then((s) => s.mtimeMs)
          .catch(() => 0)
        if (lastWrite > cutoff) continue
        await rm(join(config.uploadDir, id), { force: true })
        await store.forget(id)
        removed++
      }
      return removed
    },
  }
}

export type Ingest = ReturnType<typeof createIngest>
