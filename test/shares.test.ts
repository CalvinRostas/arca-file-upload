import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db'
import {
  Conflict,
  InvalidInput,
  NotFound,
  SharePasswordRequired,
  ShareUnavailable,
  TooManyAttempts,
  WrongSharePassword,
} from '../server/modules/errors'
import { createLibrary, type Library, type OwnerLibrary } from '../server/modules/library'
import { createShares, type OwnerShares, type Shares } from '../server/modules/shares'
import { freshDatabase } from './support/db'
import { makeUser } from './support/users'

let database: Database
let library: Library
let lib: OwnerLibrary
let mine: OwnerShares
let theirs: OwnerShares
let shares: Shares
let clock: Date

const HOUR = 3_600_000
let n = 0
const newBlob = () => ({ hash: (++n).toString(16).padStart(64, '0'), size: 10 * n })

async function add(folderId: string | null, name: string, into = lib) {
  const result = await into.addFile(folderId, { name, blob: newBlob(), mimeType: 'image/jpeg' }, 'keepBoth')
  if (result.status !== 'added') throw new Error('unexpected')
  return result.file
}

const later = (ms: number) => new Date(clock.getTime() + ms)

beforeEach(async () => {
  database = await freshDatabase()
  clock = new Date('2026-05-01T12:00:00Z')
  library = createLibrary({ db: database.db })
  shares = createShares({ db: database.db, library, secret: 'x'.repeat(32), now: () => clock })
  const ada = await makeUser(database.db, 'Ada')
  const bob = await makeUser(database.db, 'Bob')
  lib = library.for(ada)
  mine = shares.for(ada)
  theirs = shares.for(bob)
})
afterEach(() => database.close())

describe('creating and managing links', () => {
  it('shares a File with an unguessable token and lists it', async () => {
    const docs = await lib.createFolder(null, 'Docs')
    const file = await add(docs.id, 'cv.pdf')
    const link = await mine.create(file.id)

    expect(link.token).toMatch(/^[\w-]{22}$/)
    expect(link).toMatchObject({
      itemId: file.id,
      item: { kind: 'file', name: 'cv.pdf', path: [{ id: docs.id, name: 'Docs' }] },
      hasPassword: false,
      status: 'active',
      downloads: 0,
      views: 0,
      lastAccessedAt: null,
    })
    expect((await mine.list()).map((s) => s.id)).toEqual([link.id])
    expect(await mine.forItem(file.id)).toMatchObject({ id: link.id })
    expect((await lib.list(docs.id)).items[0]!.shared).toBe(true)
  })

  it('allows one link per Item', async () => {
    const file = await add(null, 'a.jpg')
    await mine.create(file.id)
    await expect(mine.create(file.id)).rejects.toThrow(Conflict)
  })

  it('validates settings', async () => {
    const file = await add(null, 'a.jpg')
    await expect(mine.create(file.id, { password: 'abc' })).rejects.toThrow(InvalidInput)
    await expect(mine.create(file.id, { expiresAt: later(-1) })).rejects.toThrow(InvalidInput)
    await expect(mine.create(file.id, { maxDownloads: 0 })).rejects.toThrow(InvalidInput)
    await expect(mine.create(file.id, { maxDownloads: 1.5 })).rejects.toThrow(InvalidInput)
  })

  it('changes only the settings given', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { password: 'secret', maxDownloads: 3 })
    const changed = await mine.update(link.id, { expiresAt: later(HOUR) })
    expect(changed).toMatchObject({ hasPassword: true, maxDownloads: 3, expiresAt: later(HOUR) })
    expect(await mine.update(link.id, { password: null, maxDownloads: null })).toMatchObject({
      hasPassword: false,
      maxDownloads: null,
    })
  })

  it('keeps Owners apart', async () => {
    const file = await add(null, 'a.jpg')
    await expect(theirs.create(file.id)).rejects.toThrow(NotFound)
    const link = await mine.create(file.id)
    expect(await theirs.list()).toEqual([])
    await expect(theirs.update(link.id, { password: null })).rejects.toThrow(NotFound)
    await expect(theirs.revoke(link.id)).rejects.toThrow(NotFound)
  })

  it('can’t share something in Trash', async () => {
    const file = await add(null, 'a.jpg')
    await lib.trash([file.id])
    await expect(mine.create(file.id)).rejects.toThrow(NotFound)
  })
})

describe('opening a link', () => {
  it('grants access to the shared Item', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id)
    const grant = await shares.resolve(link.token)
    expect(grant).toMatchObject({ itemId: file.id, ownerName: 'Ada', previews: true })
  })

  it('refuses unknown and revoked tokens alike', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id)
    await mine.revoke(link.id)
    for (const token of [link.token, 'x'.repeat(22), 'not a token']) {
      await expect(shares.resolve(token)).rejects.toMatchObject({ reason: 'gone' })
    }
    expect(await mine.list()).toEqual([])
  })

  it('stops working while its target is in Trash, and works again once restored', async () => {
    const folder = await lib.createFolder(null, 'Photos')
    const file = await add(folder.id, 'a.jpg')
    const link = await mine.create(file.id)

    await lib.trash([folder.id])
    await expect(shares.resolve(link.token)).rejects.toMatchObject({ reason: 'gone' })
    expect((await mine.list())[0]).toMatchObject({ status: 'trashed', item: { name: 'a.jpg', path: null } })

    await lib.restore([folder.id])
    await expect(shares.resolve(link.token)).resolves.toMatchObject({ itemId: file.id })
  })

  it('goes away when its target is deleted for good', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id)
    await lib.trash([file.id])
    await lib.emptyTrash()
    expect(await mine.list()).toEqual([])
    await expect(shares.resolve(link.token)).rejects.toThrow(ShareUnavailable)
  })

  it('expires', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { expiresAt: later(HOUR) })
    await expect(shares.resolve(link.token)).resolves.toBeTruthy()
    clock = later(HOUR)
    await expect(shares.resolve(link.token)).rejects.toMatchObject({ reason: 'expired', status: 410 })
    expect((await mine.list())[0]!.status).toBe('expired')
  })

  it('counts views and downloads, without anything about the visitor', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id)
    const grant = await shares.resolve(link.token)
    await shares.recordView(grant)
    await shares.recordView(grant)
    clock = later(HOUR)
    await shares.recordDownload(grant)
    expect((await mine.list())[0]).toMatchObject({ views: 2, downloads: 1, lastAccessedAt: clock })
  })

  it('stops after the download limit, and turns previews off while one is set', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { maxDownloads: 2 })
    const grant = await shares.resolve(link.token)
    expect(grant.previews).toBe(false)

    await Promise.all([shares.recordDownload(grant), shares.recordDownload(grant)])
    await expect(shares.recordDownload(grant)).rejects.toMatchObject({ reason: 'used-up' })
    await expect(shares.resolve(link.token)).rejects.toMatchObject({ reason: 'used-up' })
    expect((await mine.list())[0]).toMatchObject({ status: 'used-up', downloads: 2 })

    await mine.update(link.id, { maxDownloads: 5 })
    await expect(shares.resolve(link.token)).resolves.toBeTruthy()
  })
})

describe('passwords', () => {
  it('asks for the password, and remembers it with a pass', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { password: 'open sesame' })
    await expect(shares.resolve(link.token)).rejects.toThrow(SharePasswordRequired)
    await expect(shares.unlock(link.token, 'wrong')).rejects.toThrow(WrongSharePassword)

    const pass = await shares.unlock(link.token, 'open sesame')
    await expect(shares.resolve(link.token, pass.value)).resolves.toMatchObject({ itemId: file.id })
    await expect(shares.resolve(link.token, pass.value.replace(/.$/, 'x'))).rejects.toThrow(SharePasswordRequired)
  })

  it('stops accepting a pass when it expires or the password changes', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { password: 'open sesame' })
    const pass = await shares.unlock(link.token, 'open sesame')

    clock = later(pass.maxAgeSeconds * 1000)
    await expect(shares.resolve(link.token, pass.value)).rejects.toThrow(SharePasswordRequired)

    const fresh = await shares.unlock(link.token, 'open sesame')
    await mine.update(link.id, { password: 'new one' })
    await expect(shares.resolve(link.token, fresh.value)).rejects.toThrow(SharePasswordRequired)
  })

  it('limits wrong guesses per link, then lets them try again later', async () => {
    const file = await add(null, 'a.jpg')
    const link = await mine.create(file.id, { password: 'open sesame' })
    for (let i = 0; i < 10; i++)
      await expect(shares.unlock(link.token, `guess ${i}`)).rejects.toThrow(WrongSharePassword)
    await expect(shares.unlock(link.token, 'open sesame')).rejects.toThrow(TooManyAttempts)

    clock = later(15 * 60_000)
    await expect(shares.unlock(link.token, 'open sesame')).resolves.toBeTruthy()
  })
})

describe('what a link reaches', () => {
  it('a Folder link reaches its live subtree and nothing else', async () => {
    const photos = await lib.createFolder(null, 'Photos')
    const trip = await lib.createFolder(photos.id, 'Trip')
    const inside = await add(trip.id, 'beach.jpg')
    const outside = await add(null, 'secret.jpg')
    const view = lib.within(photos.id)

    expect(await view.root()).toMatchObject({ kind: 'folder', name: 'Photos' })
    expect(await view.list(null)).toMatchObject({ folder: { id: photos.id }, items: [{ name: 'Trip' }] })
    const listing = await view.list(trip.id)
    expect(listing.path.map((c) => c.name)).toEqual(['Photos', 'Trip'])
    expect(listing.items[0]).not.toHaveProperty('tags')
    expect(listing.items[0]).not.toHaveProperty('parentId')
    expect(await view.getFile(inside.id)).toMatchObject({ name: 'beach.jpg' })
    expect((await view.walk()).map((e) => e.path)).toEqual(['Photos', 'Photos/Trip', 'Photos/Trip/beach.jpg'])

    await expect(view.getFile(outside.id)).rejects.toThrow(NotFound)
    await expect(view.walk([outside.id])).rejects.toThrow(NotFound)
    await expect(view.list((await lib.createFolder(null, 'Other')).id)).rejects.toThrow(NotFound)

    // Moved out: out of reach. Trashed inside: out of reach.
    await lib.move([inside.id], null)
    await expect(view.getFile(inside.id)).rejects.toThrow(NotFound)
    await lib.move([inside.id], trip.id)
    await lib.trash([inside.id])
    await expect(view.getFile(inside.id)).rejects.toThrow(NotFound)
    expect((await view.list(trip.id)).items).toEqual([])
  })

  it('a File link reaches just that File', async () => {
    const folder = await lib.createFolder(null, 'Docs')
    const file = await add(folder.id, 'cv.pdf')
    const sibling = await add(folder.id, 'other.pdf')
    const view = lib.within(file.id)
    expect(await view.root()).toMatchObject({ kind: 'file', name: 'cv.pdf' })
    expect(await view.getFile(file.id)).toMatchObject({ id: file.id })
    await expect(view.getFile(sibling.id)).rejects.toThrow(NotFound)
    await expect(view.list(null)).rejects.toThrow(NotFound)
  })
})
