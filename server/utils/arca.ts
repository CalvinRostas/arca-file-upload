import { openDatabase, type Db } from '../db'
import { createAuth, type Auth } from '../modules/auth'

/** The wired-up modules. Route adapters get them from here and nowhere else. */
export interface Arca {
  db: Db
  auth: Auth
}

let ready: Promise<Arca> | undefined

export function useArca(): Promise<Arca> {
  ready ??= boot().catch((error) => {
    ready = undefined
    throw error
  })
  return ready
}

async function boot(): Promise<Arca> {
  const config = useRuntimeConfig()
  if (config.authSecret.length < 32) {
    throw new Error('NUXT_AUTH_SECRET must be set to at least 32 random characters (try `openssl rand -base64 32`)')
  }
  const database = await openDatabase(config.databaseUrl)
  await database.migrate(config.migrationsDir)
  const auth = createAuth({ db: database.db, secret: config.authSecret, baseUrl: config.baseUrl })
  return { db: database.db, auth }
}
