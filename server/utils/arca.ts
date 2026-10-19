import { mkdir } from 'node:fs/promises'
import type { H3Event } from 'h3'
import { openDatabase, type Db } from '../db'
import { createAuth, type Auth } from '../modules/auth'
import { createLocalBlobStore, type BlobStore } from '../modules/blob-store'
import { createIngest, type Ingest } from '../modules/ingest'
import { createJobs, type Jobs } from '../modules/jobs'
import { createLibrary, type Library, type OwnerLibrary } from '../modules/library'
import { createPreviews, type Previews } from '../modules/previews'

/** The wired-up modules. Route adapters get them from here and nowhere else. */
export interface Arca {
  db: Db
  auth: Auth
  library: Library
  blobStore: BlobStore
  ingest: Ingest
  jobs: Jobs
  previews: Previews
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
  const library = createLibrary({ db: database.db })
  const blobStore = createLocalBlobStore(config.blobDir)
  const jobs = createJobs({ db: database.db })
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
  await previews.backfill()
  jobs.start()

  return { db: database.db, auth, library, blobStore, ingest, jobs, previews }
}
