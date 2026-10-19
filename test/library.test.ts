import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db'
import { InvalidInput, InvalidMove, NameConflict, NotFound } from '../server/modules/errors'
import { createLibrary, type OwnerLibrary } from '../server/modules/library'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let lib: OwnerLibrary
let other: OwnerLibrary

const blobA = { hash: 'a'.repeat(64), size: 10 }
const blobB = { hash: 'b'.repeat(64), size: 20 }
const file = (name: string, blob = blobA) => ({ name, blob, mimeType: 'text/plain' })

beforeEach(async () => {
  database = await freshDatabase()
  const library = createLibrary({ db: database.db })
  lib = library.for(await makeUser(database.db, 'Ada'))
  other = library.for(await makeUser(database.db, 'Bob'))
})
afterEach(() => database.close())

const names = async (folderId: string | null = null) => (await lib.list(folderId)).items.map((i) => i.name)

describe('folders', () => {
  it('lists folders first, then files, by name', async () => {
    await lib.addFile(null, file('b.txt'), 'keepBoth')
    await lib.createFolder(null, 'Zebra')
    await lib.addFile(null, file('A.txt'), 'keepBoth')
    await lib.createFolder(null, 'apple')
    expect(await names()).toEqual(['apple', 'Zebra', 'A.txt', 'b.txt'])
  })

  it('keeps sibling names unique, ignoring case, across files and folders', async () => {
    await lib.createFolder(null, 'Taxes')
    await expect(lib.createFolder(null, 'taxes')).rejects.toThrow(NameConflict)
    await lib.addFile(null, file('notes'), 'keepBoth')
    await expect(lib.createFolder(null, 'Notes')).rejects.toThrow(NameConflict)
  })

  it('allows the same name in different folders', async () => {
    const a = await lib.createFolder(null, 'A')
    const b = await lib.createFolder(null, 'B')
    await lib.createFolder(a.id, 'Same')
    await expect(lib.createFolder(b.id, 'Same')).resolves.toMatchObject({ name: 'Same' })
  })

  it('rejects unusable names', async () => {
    for (const bad of ['', '   ', '.', '..', 'a/b', 'a\\b', 'x'.repeat(256)]) {
      await expect(lib.createFolder(null, bad)).rejects.toThrow(InvalidInput)
    }
    await expect(lib.createFolder(null, '  trimmed  ')).resolves.toMatchObject({ name: 'trimmed' })
  })

  it('reports the path down to a folder and child counts', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const y2024 = await lib.createFolder(photos.id, '2024')
    await lib.addFile(y2024.id, file('a.jpg'), 'keepBoth')

    const listing = await lib.list(y2024.id)
    expect(listing.folder).toEqual({ id: y2024.id, name: '2024' })
    expect(listing.path.map((c) => c.name)).toEqual(['Photos', '2024'])
    expect((await lib.list(photos.id)).items[0]).toMatchObject({ name: '2024', childCount: 1 })
  })

  it('ensureFolderPath reuses existing folders and creates the rest', async () => {
    const trip = await lib.createFolder(null, 'Trip')
    const deepest = await lib.ensureFolderPath(null, ['trip', 'day 1', 'raw'])
    const listing = await lib.list(deepest)
    expect(listing.path.map((c) => c.id)[0]).toBe(trip.id)
    expect(listing.path.map((c) => c.name)).toEqual(['Trip', 'day 1', 'raw'])
    expect(await lib.ensureFolderPath(null, ['Trip', 'day 1', 'raw'])).toBe(deepest)
  })

  it('ensureFolderPath steps around a file with the folder’s name', async () => {
    await lib.addFile(null, file('Trip'), 'keepBoth')
    const id = await lib.ensureFolderPath(null, ['Trip'])
    expect((await lib.list(id)).folder?.name).toBe('Trip (1)')
  })
})

describe('adding files', () => {
  it('keepBoth picks the next free name', async () => {
    await lib.addFile(null, file('photo.jpg'), 'keepBoth')
    await lib.addFile(null, file('photo.jpg'), 'keepBoth')
    await lib.addFile(null, file('PHOTO.jpg'), 'keepBoth')
    await lib.addFile(null, file('.env'), 'keepBoth')
    await lib.addFile(null, file('.env'), 'keepBoth')
    expect(await names()).toEqual(['.env', '.env (1)', 'photo (1).jpg', 'PHOTO (2).jpg', 'photo.jpg'])
  })

  it('replace moves the old file out of the way (to Trash)', async () => {
    await lib.addFile(null, file('report.pdf', blobA), 'keepBoth')
    const result = await lib.addFile(null, file('report.pdf', blobB), 'replace')
    expect(result).toMatchObject({ status: 'added', replaced: true, file: { name: 'report.pdf', size: 20 } })
    expect(await names()).toEqual(['report.pdf'])
  })

  it('replace never overwrites a folder', async () => {
    await lib.createFolder(null, 'report')
    const result = await lib.addFile(null, file('report'), 'replace')
    expect(result).toMatchObject({ status: 'added', replaced: false, file: { name: 'report (1)' } })
  })

  it('skip leaves the existing file alone', async () => {
    await lib.addFile(null, file('a.txt', blobA), 'keepBoth')
    expect(await lib.addFile(null, file('a.txt', blobB), 'skip')).toEqual({ status: 'skipped' })
    expect((await lib.list(null)).items).toHaveLength(1)
  })

  it('points out duplicates of the owner’s own files', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const first = await lib.addFile(photos.id, file('kyoto.jpg'), 'keepBoth')
    const second = await lib.addFile(null, file('copy.jpg'), 'keepBoth')
    expect(second).toMatchObject({
      status: 'added',
      duplicateOf: { name: 'kyoto.jpg', path: [{ id: photos.id, name: 'Photos' }] },
    })
    expect(first).toMatchObject({ duplicateOf: null })
  })

  it('never reveals another owner’s identical file', async () => {
    await other.addFile(null, file('secret.txt'), 'keepBoth')
    expect(await lib.addFile(null, file('mine.txt'), 'keepBoth')).toMatchObject({ duplicateOf: null })
  })

  it('tells which names are taken before uploading', async () => {
    await lib.addFile(null, file('a.txt'), 'keepBoth')
    await lib.createFolder(null, 'Docs')
    expect(await lib.takenNames(null, ['A.TXT', 'b.txt', 'docs'])).toEqual(['A.TXT', 'docs'])
  })

  it('discards a duplicate, but never the only copy', async () => {
    const first = await lib.addFile(null, file('one.txt'), 'keepBoth')
    const second = await lib.addFile(null, file('two.txt'), 'keepBoth')
    if (first.status !== 'added' || second.status !== 'added') throw new Error('unexpected')
    await lib.discardDuplicate(second.file.id)
    expect(await names()).toEqual(['one.txt'])
    await expect(lib.discardDuplicate(first.file.id)).rejects.toThrow(InvalidInput)
  })
})

describe('rename and move', () => {
  it('renames, including case-only changes, but not onto a sibling', async () => {
    const a = await lib.createFolder(null, 'Taxes')
    await lib.createFolder(null, 'Other')
    await expect(lib.rename(a.id, 'TAXES')).resolves.toMatchObject({ name: 'TAXES' })
    await expect(lib.rename(a.id, 'other')).rejects.toThrow(NameConflict)
  })

  it('moves items between folders', async () => {
    const docs = await lib.createFolder(null, 'Docs')
    const added = await lib.addFile(null, file('a.txt'), 'keepBoth')
    if (added.status !== 'added') throw new Error('unexpected')
    await lib.move([added.file.id], docs.id)
    expect(await names(docs.id)).toEqual(['a.txt'])
    await lib.move([added.file.id], null)
    expect(await names()).toEqual(['Docs', 'a.txt'])
  })

  it('refuses to move a folder into itself or its descendants', async () => {
    const a = await lib.createFolder(null, 'A')
    const b = await lib.createFolder(a.id, 'B')
    await expect(lib.move([a.id], a.id)).rejects.toThrow(InvalidMove)
    await expect(lib.move([a.id], b.id)).rejects.toThrow(InvalidMove)
  })

  it('refuses a move that would clash, and moves nothing', async () => {
    const dest = await lib.createFolder(null, 'Dest')
    await lib.addFile(dest.id, file('a.txt'), 'keepBoth')
    const one = await lib.addFile(null, file('one.txt'), 'keepBoth')
    const clash = await lib.addFile(null, file('A.TXT'), 'keepBoth')
    if (one.status !== 'added' || clash.status !== 'added') throw new Error('unexpected')
    await expect(lib.move([one.file.id, clash.file.id], dest.id)).rejects.toThrow(NameConflict)
    expect(await names(dest.id)).toEqual(['a.txt'])
  })
})

describe('owner scoping', () => {
  it('treats other owners’ items as missing', async () => {
    const theirs = await other.createFolder(null, 'Private')
    const theirFile = await other.addFile(theirs.id, file('x.txt'), 'keepBoth')
    if (theirFile.status !== 'added') throw new Error('unexpected')

    await expect(lib.list(theirs.id)).rejects.toThrow(NotFound)
    await expect(lib.createFolder(theirs.id, 'sneaky')).rejects.toThrow(NotFound)
    await expect(lib.addFile(theirs.id, file('y.txt'), 'keepBoth')).rejects.toThrow(NotFound)
    await expect(lib.rename(theirs.id, 'mine')).rejects.toThrow(NotFound)
    await expect(lib.getFile(theirFile.file.id)).rejects.toThrow(NotFound)
    await expect(lib.move([theirFile.file.id], null)).rejects.toThrow(NotFound)
    expect(await names()).toEqual([])
  })
})
