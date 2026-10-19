import { openDatabase } from '../../server/db'

/** A fresh, migrated, in-process Postgres per call. Set ARCA_TEST_DATABASE_URL to use a real one. */
export async function freshDatabase() {
  const database = await openDatabase(process.env.ARCA_TEST_DATABASE_URL ?? 'pglite:memory')
  await database.migrate('./server/db/migrations')
  return database
}
