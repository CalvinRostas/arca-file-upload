import { randomUUID } from 'node:crypto'
import { schema, type Db } from '../../server/db'

/** Insert a bare user row; enough to own Library Items in module tests. */
export async function makeUser(db: Db, name = 'Ada') {
  const id = randomUUID()
  await db.insert(schema.user).values({ id, name, email: `${name.toLowerCase()}-${id}@example.com` })
  return { id }
}
