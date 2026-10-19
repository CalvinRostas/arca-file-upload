import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import pg from 'pg'
import * as schema from './schema'

export { schema }

/**
 * The app always talks to Postgres. `pglite:<dir>` (or `pglite:memory`) runs an in-process
 * WASM Postgres instead, for tests and for running locally without Docker.
 */
export type Db = NodePgDatabase<typeof schema>

export interface Database {
  db: Db
  migrate(migrationsFolder: string): Promise<void>
  close(): Promise<void>
}

export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite')
    const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm')
    const dataDir = url.slice('pglite:'.length)
    const client = new PGlite(dataDir === 'memory' ? undefined : dataDir, { extensions: { pg_trgm } })
    const db = drizzlePglite(client, { schema })
    return {
      // PGlite's drizzle driver exposes the same query interface as node-postgres.
      db: db as unknown as Db,
      migrate: (migrationsFolder) => migratePglite(db, { migrationsFolder }),
      close: () => client.close(),
    }
  }

  const pool = new pg.Pool({ connectionString: url })
  const db = drizzlePg(pool, { schema })
  return {
    db,
    migrate: (migrationsFolder) => migratePg(db, { migrationsFolder }),
    close: () => pool.end(),
  }
}
