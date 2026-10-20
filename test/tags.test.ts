import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db'
import { InvalidInput, NotFound, TagNameTaken } from '../server/modules/errors'
import { createLibrary, type OwnerLibrary } from '../server/modules/library'
import { createTags } from '../server/modules/tags'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let lib: OwnerLibrary
let tags: ReturnType<ReturnType<typeof createTags>['for']>
let theirTags: typeof tags
let theirLib: OwnerLibrary

beforeEach(async () => {
  database = await freshDatabase()
  const ada = await makeUser(database.db, 'Ada')
  const bob = await makeUser(database.db, 'Bob')
  lib = createLibrary({ db: database.db }).for(ada)
  theirLib = createLibrary({ db: database.db }).for(bob)
  tags = createTags({ db: database.db }).for(ada)
  theirTags = createTags({ db: database.db }).for(bob)
})
afterEach(() => database.close())

let n = 0
async function addFile(library = lib, name = `f${n++}.txt`) {
  const result = await library.addFile(
    null,
    { name, blob: { hash: String(n).padStart(64, '0'), size: 1 }, mimeType: null },
    'keepBoth',
  )
  if (result.status !== 'added') throw new Error('unexpected')
  return result.file
}

describe('tags', () => {
  it('creates, lists (by name), renames, recolours, and deletes', async () => {
    const taxes = await tags.create('  taxes ', 'ochre')
    await tags.create('Family', 'sage')
    expect((await tags.list()).map((t) => [t.name, t.color])).toEqual([
      ['Family', 'sage'],
      ['taxes', 'ochre'],
    ])
    await tags.update(taxes.id, { name: 'Taxes 2025', color: 'clay' })
    expect((await tags.list())[1]).toMatchObject({ name: 'Taxes 2025', color: 'clay' })
    await tags.remove(taxes.id)
    expect(await tags.list()).toHaveLength(1)
  })

  it('keeps names unique per owner, ignoring case', async () => {
    const family = await tags.create('Family', 'sage')
    await expect(tags.create('family', 'lake')).rejects.toThrow(TagNameTaken)
    const other = await tags.create('Other', 'lake')
    await expect(tags.update(other.id, { name: 'FAMILY' })).rejects.toThrow(TagNameTaken)
    await expect(theirTags.create('Family', 'sage')).resolves.toMatchObject({ name: 'Family' })
    expect(family.name).toBe('Family')
  })

  it('validates names and colours', async () => {
    await expect(tags.create('', 'sage')).rejects.toThrow(InvalidInput)
    await expect(tags.create('x'.repeat(41), 'sage')).rejects.toThrow(InvalidInput)
    await expect(tags.create('say "hi"', 'sage')).rejects.toThrow(InvalidInput)
    await expect(tags.create('ok', 'neon')).rejects.toThrow(InvalidInput)
  })

  it('tags and untags several files at once, and shows them in listings', async () => {
    const [a, b] = [await addFile(), await addFile()]
    const family = await tags.create('family', 'sage')
    const travel = await tags.create('travel', 'lake')

    await tags.apply([a.id, b.id], { add: [family.id, travel.id] })
    await tags.apply([a.id, b.id], { add: [family.id] }) // idempotent
    await tags.apply([b.id], { remove: [travel.id] })

    const items = Object.fromEntries((await lib.list(null)).items.map((i) => [i.id, [...i.tags].sort()]))
    expect(items[a.id]).toEqual([family.id, travel.id].sort())
    expect(items[b.id]).toEqual([family.id])
    expect((await tags.list()).map((t) => [t.name, t.fileCount])).toEqual([
      ['family', 2],
      ['travel', 1],
    ])
  })

  it('only tags the owner’s files, with the owner’s tags, and never folders', async () => {
    const mine = await addFile()
    const theirs = await addFile(theirLib)
    const myTag = await tags.create('mine', 'sage')
    const theirTag = await theirTags.create('theirs', 'rose')
    const folder = await lib.createFolder(null, 'Docs')

    await expect(tags.apply([theirs.id], { add: [myTag.id] })).rejects.toThrow(NotFound)
    await expect(tags.apply([mine.id], { add: [theirTag.id] })).rejects.toThrow(NotFound)
    await expect(tags.apply([folder.id], { add: [myTag.id] })).rejects.toThrow(NotFound)
    await expect(theirTags.remove(myTag.id)).rejects.toThrow(NotFound)
  })

  it('deleting a tag leaves the files alone', async () => {
    const file = await addFile()
    const t = await tags.create('temp', 'moss')
    await tags.apply([file.id], { add: [t.id] })
    await tags.remove(t.id)
    expect((await lib.list(null)).items.find((i) => i.id === file.id)?.tags).toEqual([])
  })
})
