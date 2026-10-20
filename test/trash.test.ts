import { inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema, type Database } from '../server/db'
import { NotFound } from '../server/modules/errors'
import { createLibrary, TRASH_RETENTION_DAYS, type Library, type OwnerLibrary } from '../server/modules/library'
import { createTags } from '../server/modules/tags'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let library: Library
let lib: OwnerLibrary
let other: OwnerLibrary
let releases: number

const DAY = 86_400_000
let n = 0
const newBlob = () => ({ hash: (++n).toString(16).padStart(64, '0'), size: 100 * n })

async function add(folderId: string | null, name: string, blob = newBlob(), into = lib) {
  const result = await into.addFile(folderId, { name, blob, mimeType: 'text/plain' }, 'keepBoth')
  if (result.status !== 'added') throw new Error('unexpected')
  return result.file
}

const names = async (folderId: string | null = null) => (await lib.list(folderId)).items.map((i) => i.name)
const blobCount = async () => (await database.db.select().from(schema.blob)).length

beforeEach(async () => {
  database = await freshDatabase()
  releases = 0
  library = createLibrary({ db: database.db, onBlobsReleased: async () => void releases++ })
  lib = library.for(await makeUser(database.db, 'Ada'))
  other = library.for(await makeUser(database.db, 'Bob'))
})
afterEach(() => database.close())

describe('moving to Trash', () => {
  it('hides a File and frees its name', async () => {
    const docs = await lib.createFolder(null, 'Docs')
    const file = await add(docs.id, 'notes.txt')
    await lib.trash([file.id])

    expect(await names(docs.id)).toEqual([])
    await expect(lib.getFile(file.id)).rejects.toThrow(NotFound)
    await expect(add(docs.id, 'notes.txt')).resolves.toMatchObject({ name: 'notes.txt' })
    expect(await lib.trashEntries()).toMatchObject([{ id: file.id, kind: 'file', name: 'notes.txt', from: ['Docs'] }])
  })

  it('takes a Folder’s whole subtree along as one entry', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const trip = await lib.createFolder(photos.id, 'Trip')
    const deep = await add(trip.id, 'a.jpg')
    const shallow = await add(photos.id, 'b.jpg')
    await lib.trash([photos.id])

    expect(await names()).toEqual([])
    await expect(lib.list(trip.id)).rejects.toThrow(NotFound)
    await expect(lib.getFile(deep.id)).rejects.toThrow(NotFound)
    await expect(lib.walk([trip.id])).rejects.toThrow(NotFound)
    await expect(lib.createFolder(trip.id, 'New')).rejects.toThrow(NotFound)
    await expect(lib.move([(await lib.createFolder(null, 'X')).id], trip.id)).rejects.toThrow(NotFound)

    const [entry, ...rest] = await lib.trashEntries()
    expect(rest).toEqual([])
    expect(entry).toMatchObject({ id: photos.id, kind: 'folder', fileCount: 2, from: [] })
    expect(entry!.size).toBe(deep.size! + shallow.size!)
  })

  it('makes something inside a Folder trashed in the same call part of the Folder’s entry', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const inner = await add(photos.id, 'a.jpg')
    const { entryIds } = await lib.trash([inner.id, photos.id])
    expect(entryIds).toEqual([photos.id])
    expect((await lib.trashEntries()).map((e) => e.name)).toEqual(['Photos'])
  })

  it('sends a replaced File to Trash, where it can be restored', async () => {
    const old = await add(null, 'report.pdf')
    await lib.addFile(null, { name: 'report.pdf', blob: newBlob(), mimeType: null }, 'replace')
    expect(await lib.trashEntries()).toMatchObject([{ id: old.id, name: 'report.pdf' }])
    const [restored] = await lib.restore([old.id])
    expect(restored).toMatchObject({ name: 'report (1).pdf', renamed: true })
  })

  it('reports when each entry will be deleted for good', async () => {
    const file = await add(null, 'a.txt')
    await lib.trash([file.id])
    const [entry] = await lib.trashEntries()
    expect(entry!.purgeAt.getTime() - entry!.trashedAt.getTime()).toBe(TRASH_RETENTION_DAYS * DAY)
  })
})

describe('restoring', () => {
  it('puts an entry back where it was, subtree and Tags included', async () => {
    const tags = createTags({ db: database.db }).for({ id: (await database.db.select().from(schema.user))[0]!.id })
    const photos = await lib.createFolder(null, 'Photos')
    const trip = await lib.createFolder(photos.id, 'Trip')
    const file = await add(trip.id, 'a.jpg')
    const travel = await tags.create('travel', 'lake')
    await tags.apply([file.id], { add: [travel.id] })

    await lib.trash([trip.id])
    expect((await tags.list())[0]!.fileCount).toBe(0)
    const [restored] = await lib.restore([trip.id])

    expect(restored).toMatchObject({ name: 'Trip', renamed: false, path: [{ id: photos.id, name: 'Photos' }] })
    expect(await names(trip.id)).toEqual(['a.jpg'])
    expect((await lib.list(trip.id)).items[0]!.tags).toEqual([travel.id])
    expect(await lib.trashEntries()).toEqual([])
  })

  it('follows its Folder if that has moved since', async () => {
    const docs = await lib.createFolder(null, 'Docs')
    const archive = await lib.createFolder(null, 'Archive')
    const file = await add(docs.id, 'a.txt')
    await lib.trash([file.id])
    await lib.move([docs.id], archive.id)
    const [restored] = await lib.restore([file.id])
    expect(restored!.path.map((c) => c.name)).toEqual(['Archive', 'Docs'])
  })

  it('recreates the path when its Folder is in Trash too', async () => {
    const work = await lib.createFolder(null, 'Work')
    const taxes = await lib.createFolder(work.id, 'Taxes')
    const file = await add(taxes.id, '2024.pdf')
    await lib.trash([file.id])
    await lib.trash([taxes.id])

    const [restored] = await lib.restore([file.id])
    expect(restored!.path.map((c) => c.name)).toEqual(['Work', 'Taxes'])
    expect(restored!.path[0]!.id).toBe(work.id) // reuses what still exists
    expect(restored!.path[1]!.id).not.toBe(taxes.id) // a new Taxes; the old one stays in Trash
    expect((await lib.trashEntries()).map((e) => e.name)).toEqual(['Taxes'])
  })

  it('brings a Folder back before what was trashed inside it earlier, when restoring both', async () => {
    const taxes = await lib.createFolder(null, 'Taxes')
    const file = await add(taxes.id, '2024.pdf')
    await lib.trash([file.id])
    await lib.trash([taxes.id])

    await lib.restore([file.id, taxes.id])
    expect(await names()).toEqual(['Taxes'])
    expect(await names(taxes.id)).toEqual(['2024.pdf'])
  })

  it('picks a free name when the old one is taken', async () => {
    const file = await add(null, 'notes.txt')
    await lib.trash([file.id])
    await add(null, 'notes.txt')
    const [restored] = await lib.restore([file.id])
    expect(restored).toMatchObject({ name: 'notes (1).txt', renamed: true, path: [] })
    expect(await names()).toEqual(['notes (1).txt', 'notes.txt'])
  })

  it('only restores whole entries, not things inside them', async () => {
    const folder = await lib.createFolder(null, 'F')
    const file = await add(folder.id, 'a.txt')
    await lib.trash([folder.id])
    await expect(lib.restore([file.id])).rejects.toThrow(NotFound)
  })
})

describe('deleting for good', () => {
  it('deletes chosen entries and keeps the rest', async () => {
    const a = await add(null, 'a.txt')
    const b = await add(null, 'b.txt')
    await lib.trash([a.id, b.id])
    await lib.deleteForever([a.id])
    expect((await lib.trashEntries()).map((e) => e.name)).toEqual(['b.txt'])
    await expect(lib.restore([a.id])).rejects.toThrow(NotFound)
    expect(releases).toBe(1)
  })

  it('keeps an older entry that was inside a Folder deleted for good, and restores it by path', async () => {
    const taxes = await lib.createFolder(null, 'Taxes')
    const file = await add(taxes.id, '2024.pdf')
    await lib.trash([file.id])
    await lib.trash([taxes.id])
    await lib.deleteForever([taxes.id])

    expect((await lib.trashEntries()).map((e) => [e.name, e.from])).toEqual([['2024.pdf', ['Taxes']]])
    const [restored] = await lib.restore([file.id])
    expect(restored!.path.map((c) => c.name)).toEqual(['Taxes'])
  })

  it('empties the whole Trash', async () => {
    const folder = await lib.createFolder(null, 'F')
    await add(folder.id, 'inside.txt')
    const loose = await add(null, 'loose.txt')
    await add(null, 'kept.txt')
    await lib.trash([folder.id, loose.id])
    expect(await lib.emptyTrash()).toBe(2)
    expect(await lib.trashEntries()).toEqual([])
    expect(await names()).toEqual(['kept.txt'])
    expect(await lib.emptyTrash()).toBe(0)
  })

  it('purges entries older than the retention period, for every Owner', async () => {
    const mine = await add(null, 'old.txt')
    const theirs = await add(null, 'theirs.txt', newBlob(), other)
    await lib.trash([mine.id])
    await other.trash([theirs.id])
    const fresh = await add(null, 'fresh.txt')
    await lib.trash([fresh.id])

    const now = new Date()
    expect(await library.purgeExpiredTrash(new Date(now.getTime() + (TRASH_RETENTION_DAYS - 1) * DAY))).toBe(0)
    // Pretend `fresh` was trashed just now and the others a month ago.
    await database.db
      .update(schema.item)
      .set({ trashedAt: new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY - 1000) })
      .where(inArray(schema.item.id, [mine.id, theirs.id]))
    expect(await library.purgeExpiredTrash(now)).toBe(2)
    expect((await lib.trashEntries()).map((e) => e.name)).toEqual(['fresh.txt'])
    expect(await other.trashEntries()).toEqual([])
  })
})

describe('owner scoping', () => {
  it('never touches another Owner’s Items or Trash', async () => {
    const theirs = await add(null, 'secret.txt', newBlob(), other)
    await expect(lib.trash([theirs.id])).rejects.toThrow(NotFound)
    await other.trash([theirs.id])
    expect(await lib.trashEntries()).toEqual([])
    await expect(lib.restore([theirs.id])).rejects.toThrow(NotFound)
    await expect(lib.deleteForever([theirs.id])).rejects.toThrow(NotFound)
    expect(await lib.emptyTrash()).toBe(0)
    expect(await other.trashEntries()).toHaveLength(1)
  })
})

describe('Blob GC', () => {
  it('collects only Blobs no File points at, trashed Files included', async () => {
    const shared = newBlob()
    const mine = await add(null, 'shared.bin', shared)
    await add(null, 'theirs.bin', shared, other)
    const soloBlob = newBlob()
    const solo = await add(null, 'solo.bin', soloBlob)
    await add(null, 'kept.bin')
    await lib.trash([mine.id, solo.id])

    const swept: string[] = []
    const sweep = async (hash: string) => void swept.push(hash)
    expect(await library.collectBlobs(sweep)).toEqual({ blobs: 0, bytes: 0 })

    await lib.emptyTrash()
    const result = await library.collectBlobs(sweep)
    expect(result).toEqual({ blobs: 1, bytes: solo.size })
    expect(swept).toEqual([soloBlob.hash])
    expect(await blobCount()).toBe(2) // the shared one (Bob still has it) and kept.bin
  })

  it('leaves the Blob row when sweeping fails, so the next run tries again', async () => {
    const file = await add(null, 'a.bin')
    await lib.trash([file.id])
    await lib.emptyTrash()
    await expect(library.collectBlobs(() => Promise.reject(new Error('disk')))).rejects.toThrow('disk')
    expect(await blobCount()).toBe(1)
    expect((await library.collectBlobs(async () => {})).blobs).toBe(1)
    expect(await blobCount()).toBe(0)
  })

  it('stores bytes while adding a File, but not for a skipped one', async () => {
    const stored: string[] = []
    const blob = newBlob()
    const store = async () => void stored.push(blob.hash)
    await lib.addFile(null, { name: 'a.bin', blob, mimeType: null, store }, 'keepBoth')
    await lib.addFile(null, { name: 'a.bin', blob, mimeType: null, store }, 'skip')
    expect(stored).toEqual([blob.hash])
  })
})
