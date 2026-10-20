import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema, type Database } from '../server/db'
import { NotFound } from '../server/modules/errors'
import { createLibrary, type OwnerLibrary } from '../server/modules/library'
import { createSearch } from '../server/modules/search'
import { createTags } from '../server/modules/tags'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let lib: OwnerLibrary
let search: ReturnType<ReturnType<typeof createSearch>['for']>
let theirs: OwnerLibrary
let tags: ReturnType<ReturnType<typeof createTags>['for']>

let n = 0
async function add(folderId: string | null, name: string, mimeType: string | null = null, library = lib) {
  const blob = { hash: String(++n).padStart(64, '0'), size: n }
  const result = await library.addFile(folderId, { name, blob, mimeType }, 'keepBoth')
  if (result.status !== 'added') throw new Error('unexpected')
  return result.file
}

const names = async (q: string, within?: string) => (await search.search(q, { within })).results.map((r) => r.name)

beforeEach(async () => {
  database = await freshDatabase()
  const ada = await makeUser(database.db, 'Ada')
  const bob = await makeUser(database.db, 'Bob')
  const library = createLibrary({ db: database.db })
  lib = library.for(ada)
  theirs = library.for(bob)
  search = createSearch({ db: database.db, library }).for(ada)
  tags = createTags({ db: database.db }).for(ada)
})
afterEach(() => database.close())

describe('search', () => {
  it('finds names by substring and tolerates typos, best match first', async () => {
    await add(null, 'receipt-amazon-2024.pdf', 'application/pdf')
    await add(null, 'Invoice March.pdf', 'application/pdf')
    await add(null, 'lake-bled-morning.jpg', 'image/jpeg')
    await add(null, 'receipt.pdf', 'application/pdf')

    expect(await names('recipt')).toEqual(expect.arrayContaining(['receipt-amazon-2024.pdf', 'receipt.pdf']))
    expect(await names('invoce')).toEqual(['Invoice March.pdf'])
    expect(await names('beach')).toEqual([])
    expect((await names('receipt.pdf'))[0]).toBe('receipt.pdf')
    expect(await names('bled morning')).toEqual(['lake-bled-morning.jpg'])
  })

  it('matches short words only as substrings', async () => {
    await add(null, 'tax-2024.pdf')
    await add(null, 'cab.txt')
    expect(await names('tax')).toEqual(['tax-2024.pdf'])
    expect(await names('ab')).toEqual(['cab.txt'])
  })

  it('finds folders too, but never trashed or other owners’ items', async () => {
    await lib.createFolder(null, 'Photos 2024')
    await add(null, 'photos-backup.zip')
    await add(null, 'photos-secret.zip', null, theirs)
    await add(null, 'photos-old.zip')
    await database.db.update(schema.item).set({ trashedAt: new Date() }).where(eq(schema.item.name, 'photos-old.zip'))
    expect((await names('photos')).sort()).toEqual(['Photos 2024', 'photos-backup.zip'])
  })

  it('filters by type (several types widen)', async () => {
    await add(null, 'a.jpg', 'image/jpeg')
    await add(null, 'b.HEIC', null)
    await add(null, 'c.pdf', 'application/pdf')
    await add(null, 'd.zip')
    await lib.createFolder(null, 'e')
    expect((await names('type:image')).sort()).toEqual(['a.jpg', 'b.HEIC'])
    expect((await names('type:pdf type:archive')).sort()).toEqual(['c.pdf', 'd.zip'])
    expect(await names('type:folder')).toEqual(['e'])
  })

  it('filters by tags (all must match)', async () => {
    const [a, b] = [await add(null, 'a.txt'), await add(null, 'b.txt')]
    const family = await tags.create('family', 'sage')
    const travel = await tags.create('Two Words', 'lake')
    await tags.apply([a.id, b.id], { add: [family.id] })
    await tags.apply([a.id], { add: [travel.id] })
    expect((await names('tag:family')).sort()).toEqual(['a.txt', 'b.txt'])
    expect(await names('tag:FAMILY tag:"two words"')).toEqual(['a.txt'])
  })

  it('reports an unknown tag instead of guessing', async () => {
    await add(null, 'a.txt')
    const response = await search.search('tag:nope')
    expect(response.results).toEqual([])
    expect(response.problems).toEqual(['You don’t have a tag called “nope”.'])
  })

  it('searches inside a folder path (in:) or a folder id (within), including subfolders', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const y2024 = await lib.createFolder(photos.id, '2024')
    await add(y2024.id, 'kyoto.jpg')
    await add(photos.id, 'kyoto-old.jpg')
    await add(null, 'kyoto-notes.txt')

    expect((await names('kyoto in:/photos')).sort()).toEqual(['kyoto-old.jpg', 'kyoto.jpg'])
    expect(await names('kyoto in:Photos/2024')).toEqual(['kyoto.jpg'])
    expect(await names('kyoto', y2024.id)).toEqual(['kyoto.jpg'])
    expect((await search.search('kyoto in:/nowhere')).problems).toEqual(['There’s no folder at “/nowhere”.'])
    await expect(search.search('x', { within: 'not-a-folder' })).rejects.toThrow(NotFound)
  })

  it('filters by when items were added', async () => {
    const old = await add(null, 'old.txt')
    await add(null, 'new.txt')
    await database.db
      .update(schema.item)
      .set({ createdAt: new Date('2023-05-01T00:00:00Z') })
      .where(eq(schema.item.id, old.id))
    expect(await names('before:2024')).toEqual(['old.txt'])
    expect(await names('after:2023')).toEqual(['new.txt'])
    expect(await names('after:2023-04 before:2023-06')).toEqual(['old.txt'])
  })

  it('returns results with their folder path, for display', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    await add(photos.id, 'sunset.jpg')
    const [result] = (await search.search('sunset')).results
    expect(result).toMatchObject({ name: 'sunset.jpg', path: [{ id: photos.id, name: 'Photos' }], tags: [] })
  })

  it('returns nothing for an empty query', async () => {
    await add(null, 'a.txt')
    expect(await names('   ')).toEqual([])
  })
})
