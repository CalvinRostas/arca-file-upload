import { mkdir } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { openDatabase, type Db } from '../db'
import { createAuth, type Auth } from '../modules/auth'
import { createLocalBlobStore, type BlobStore } from '../modules/blob-store'
import { createIngest, type Ingest } from '../modules/ingest'
import { createJobs, type Jobs } from '../modules/jobs'
import { createLibrary, type Library, type OwnerLibrary } from '../modules/library'
import { createPreviews, type Previews } from '../modules/previews'
import { createSearch, type Search } from '../modules/search'
import { createShares, type Shares } from '../modules/shares'
import { createTags, type Tags } from '../modules/tags'

/** The wired-up modules. Route adapters get them from here and nowhere else. */
export interface Arca {
  db: Db
  auth: Auth
  library: Library
  blobStore: BlobStore
  ingest: Ingest
  jobs: Jobs
  previews: Previews
  tags: Tags
  search: Search
  shares: Shares
}

const HOUR = 3_600_000

export const UPLOADS_PATH = '/api/uploads'

let ready: Promise<Arca> | undefined

export function useArca(): Promise<Arca> {
  ready ??= boot().catch((error) => {
    ready = undefined
    throw error
  })
  return ready
}

/** The signed-in Owner's Library, or a 401. */
export async function useOwnerLibrary(event: H3Event): Promise<OwnerLibrary> {
  const { auth, library } = await useArca()
  return library.for(await auth.requireUser(event.headers))
}

/** The signed-in Owner's Tags and Search, or a 401. */
export async function useOwnerScope(event: H3Event) {
  const { auth, tags, search } = await useArca()
  const owner = await auth.requireUser(event.headers)
  return { tags: tags.for(owner), search: search.for(owner) }
}

/** The signed-in Owner's Share links, or a 401. */
export async function useOwnerShares(event: H3Event) {
  const { auth, shares } = await useArca()
  return shares.for(await auth.requireUser(event.headers))
}

async function boot(): Promise<Arca> {
  const config = useRuntimeConfig()
  if (config.authSecret.length < 32) {
    throw new Error('NUXT_AUTH_SECRET must be set to at least 32 random characters (try `openssl rand -base64 32`)')
  }
  const database = await openDatabase(config.databaseUrl)
  await database.migrate(config.migrationsDir)
  await mkdir(config.blobDir, { recursive: true })
  await mkdir(config.uploadDir, { recursive: true })
  await mkdir(config.previewDir, { recursive: true })

  const auth = createAuth({ db: database.db, secret: config.authSecret, baseUrl: config.baseUrl })
  const jobs = createJobs({ db: database.db })
  const library = createLibrary({
    db: database.db,
    // Reclaim disk space soon after something is deleted for good, not just nightly.
    onBlobsReleased: () => jobs.enqueue('collect-blobs', {}, { dedupeKey: 'collect-blobs' }),
  })
  const tags = createTags({ db: database.db })
  const search = createSearch({ db: database.db, library })
  const shares = createShares({ db: database.db, library, secret: config.authSecret })
  const blobStore = createLocalBlobStore(config.blobDir)
  const previews = createPreviews({ db: database.db, blobStore, jobs, dir: config.previewDir })
  const ingest = createIngest({
    library,
    blobStore,
    uploadDir: config.uploadDir,
    path: UPLOADS_PATH,
    maxFileBytes: Number(config.maxUploadBytes),
    authenticate: (headers) => auth.requireUser(headers),
    onFileAdded: ({ blobHash, mimeType }) => previews.request(blobHash, mimeType),
  })

  // Housekeeping (GLOSSARY: Upload — abandoned after 24 h without progress).
  jobs.register('cleanup-uploads', async () => void (await ingest.cleanupAbandoned(24 * HOUR)))
  jobs.every('cleanup-uploads', HOUR)
  // GLOSSARY: Trash — entries are purged after 30 days; then unreferenced Blobs are collected.
  jobs.register('purge-trash', async () => void (await library.purgeExpiredTrash()))
  jobs.every('purge-trash', HOUR)
  jobs.register('collect-blobs', async () => {
    const { blobs, bytes } = await library.collectBlobs(async (hash) => {
      await blobStore.delete(hash)
      await previews.forget(hash)
    })
    if (blobs > 0) console.info(`[arca] blob GC: removed ${blobs} blobs, ${bytes} bytes`)
  })
  jobs.every('collect-blobs', 24 * HOUR)
  await previews.backfill()
  jobs.start()

  return { db: database.db, auth, library, blobStore, ingest, jobs, previews, tags, search, shares }
}
