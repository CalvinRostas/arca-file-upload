import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2'
import { and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { schema, type Db } from '../../db'
import {
  Conflict,
  InvalidInput,
  NotFound,
  SharePasswordRequired,
  ShareUnavailable,
  TooManyAttempts,
  WrongSharePassword,
} from '../errors'
import type { Crumb, Library } from '../library'

const { share, item, user } = schema

/** How a link is limited. In updates, a missing field means "leave as is" and null means "none". */
export interface ShareSettings {
  password?: string | null
  expiresAt?: Date | null
  maxDownloads?: number | null
}

export type ShareStatus = 'active' | 'expired' | 'used-up' | 'trashed'

/** A Share link as its Owner sees it (the Shared view). */
export interface Share {
  id: string
  token: string
  itemId: string
  item: {
    kind: 'folder' | 'file'
    name: string
    mimeType: string | null
    /** Files only. */
    size: number | null
    thumbnail: boolean
    /** The Folder it sits in, from the top; null while it's in Trash. */
    path: Crumb[] | null
  }
  hasPassword: boolean
  expiresAt: Date | null
  maxDownloads: number | null
  downloads: number
  /** How many times the link was opened. */
  views: number
  lastAccessedAt: Date | null
  createdAt: Date
  status: ShareStatus
}

/** What a visitor holding a working link may do. */
export interface Grant {
  shareId: string
  ownerId: string
  itemId: string
  ownerName: string
  expiresAt: Date | null
  /**
   * Viewing files in the browser. Off while downloads are limited: a preview hands over the
   * same bytes as a download, so it would be a way around the limit.
   */
  previews: boolean
}

/** Proof that a visitor typed the password; the route keeps it in a cookie. */
export interface Pass {
  value: string
  maxAgeSeconds: number
}

export interface SharesConfig {
  db: Db
  library: Library
  /** Signs Passes. At least 32 random characters. */
  secret: string
  now?: () => Date
  /** How long a typed password is remembered. */
  passTtlMs?: number
}

export type Shares = ReturnType<typeof createShares>
export type OwnerShares = ReturnType<Shares['for']>

const MIN_PASSWORD_LENGTH = 4
const MAX_DOWNLOADS = 1_000_000
const TOKEN_PATTERN = /^[\w-]{16,64}$/
const DEFAULT_PASS_TTL_MS = 24 * 3_600_000
/** Wrong passwords allowed per link per window, before it stops checking for a while. */
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60_000

/**
 * Share links: creating and changing them for an Owner, and checking them for visitors
 * (token, Trash, expiry, download limit, password). Visitors are never identified: there are
 * counters and a last-access time, and no IPs (password attempts are limited per link).
 * What a working link reaches is answered by `library.for(owner).within(itemId)`.
 */
export function createShares({
  db,
  library,
  secret,
  now = () => new Date(),
  passTtlMs = DEFAULT_PASS_TTL_MS,
}: SharesConfig) {
  const passKey = createHmac('sha256', secret).update('arca share pass').digest()
  const failures = new Map<string, { count: number; until: number }>()

  function sign(shareId: string, passwordHash: string, expires: number): string {
    return createHmac('sha256', passKey).update(`${shareId}.${passwordHash}.${expires}`).digest('base64url')
  }

  /** Valid until it expires or the password changes. */
  function checkPass(shareId: string, passwordHash: string, pass: string | undefined): boolean {
    const [expires, mac] = (pass ?? '').split('.')
    if (!expires || !mac || Number(expires) <= now().getTime()) return false
    const expected = Buffer.from(sign(shareId, passwordHash, Number(expires)))
    const given = Buffer.from(mac)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  /** The link's row if it works right now, apart from the password. */
  async function usable(token: string) {
    if (!TOKEN_PATTERN.test(token)) throw new ShareUnavailable('gone')
    const [row] = await db
      .select({ share, trashedAt: item.trashedAt, ownerName: user.name })
      .from(share)
      .innerJoin(item, eq(item.id, share.itemId))
      .innerJoin(user, eq(user.id, share.ownerId))
      .where(eq(share.token, token))
    if (!row || row.trashedAt) throw new ShareUnavailable('gone')
    const status = statusOf(row.share, null, now())
    if (status !== 'active') throw new ShareUnavailable(status === 'expired' ? 'expired' : 'used-up')
    return { ...row.share, ownerName: row.ownerName }
  }

  return {
    for(owner: { id: string }) {
      return scoped(owner.id)
    },

    /** Check a link for a visitor. `pass` is what `unlock` returned, if they typed the password. */
    async resolve(token: string, pass?: string): Promise<Grant> {
      const row = await usable(token)
      if (row.passwordHash && !checkPass(row.id, row.passwordHash, pass)) throw new SharePasswordRequired()
      return {
        shareId: row.id,
        ownerId: row.ownerId,
        itemId: row.itemId,
        ownerName: row.ownerName,
        expiresAt: row.expiresAt,
        previews: row.maxDownloads === null,
      }
    },

    /** Check a typed password. Each link allows a limited number of wrong ones per window. */
    async unlock(token: string, password: string): Promise<Pass> {
      const row = await usable(token)
      const at = now().getTime()
      const record = failures.get(row.id)
      if (record && record.until <= at) failures.delete(row.id)
      else if (record && record.count >= MAX_FAILURES) throw new TooManyAttempts((record.until - at) / 1000)

      if (row.passwordHash && !(await argon2Verify(row.passwordHash, password).catch(() => false))) {
        const current = failures.get(row.id)
        if (current) current.count++
        else failures.set(row.id, { count: 1, until: at + FAILURE_WINDOW_MS })
        throw new WrongSharePassword()
      }
      failures.delete(row.id)
      const expires = at + passTtlMs
      return {
        value: `${expires}.${sign(row.id, row.passwordHash ?? '', expires)}`,
        maxAgeSeconds: Math.floor(passTtlMs / 1000),
      }
    },

    /** Someone opened the link. */
    async recordView(grant: Grant): Promise<void> {
      await db
        .update(share)
        .set({ views: sql`${share.views} + 1`, lastAccessedAt: now() })
        .where(eq(share.id, grant.shareId))
    },

    /** Take one download from the link's allowance, or fail if it's used up. */
    async recordDownload(grant: Grant): Promise<void> {
      const taken = await db
        .update(share)
        .set({ downloads: sql`${share.downloads} + 1`, lastAccessedAt: now() })
        .where(
          and(eq(share.id, grant.shareId), or(isNull(share.maxDownloads), lt(share.downloads, share.maxDownloads))),
        )
        .returning({ id: share.id })
      if (taken.length === 0) throw new ShareUnavailable('used-up')
    },
  }

  function scoped(ownerId: string) {
    const items = library.for({ id: ownerId })

    async function summaries(where: SQL | undefined): Promise<Share[]> {
      const rows = await db
        .select({
          share,
          item: { kind: item.kind, name: item.name, mimeType: item.mimeType, trashedAt: item.trashedAt },
        })
        .from(share)
        .innerJoin(item, eq(item.id, share.itemId))
        .where(and(eq(share.ownerId, ownerId), where))
        .orderBy(desc(share.createdAt))
      const live = new Map(
        (await items.describe(rows.filter((r) => !r.item.trashedAt).map((r) => r.share.itemId))).map((i) => [i.id, i]),
      )
      const at = now()
      return rows.map(({ share: s, item: target }) => {
        const described = live.get(s.itemId)
        return {
          id: s.id,
          token: s.token,
          itemId: s.itemId,
          item: {
            kind: target.kind,
            name: target.name,
            mimeType: target.mimeType,
            size: described?.size ?? null,
            thumbnail: described?.thumbnail ?? false,
            path: described ? described.path : null,
          },
          hasPassword: s.passwordHash !== null,
          expiresAt: s.expiresAt,
          maxDownloads: s.maxDownloads,
          downloads: s.downloads,
          views: s.views,
          lastAccessedAt: s.lastAccessedAt,
          createdAt: s.createdAt,
          status: statusOf(s, target.trashedAt, at),
        }
      })
    }

    async function one(shareId: string): Promise<Share> {
      const [found] = await summaries(eq(share.id, shareId))
      if (!found) throw new NotFound('Share link not found')
      return found
    }

    /** The columns `settings` changes; fields it leaves out aren't touched. */
    async function columns(settings: ShareSettings) {
      const set: Partial<typeof share.$inferInsert> = {}
      if (settings.password !== undefined) {
        const password = settings.password
        if (password !== null && password.length < MIN_PASSWORD_LENGTH) {
          throw new InvalidInput(`Use at least ${MIN_PASSWORD_LENGTH} characters for the password`)
        }
        set.passwordHash = password === null ? null : await argon2Hash(password)
      }
      if (settings.expiresAt !== undefined) {
        if (settings.expiresAt !== null && settings.expiresAt <= now()) {
          throw new InvalidInput('Pick an expiry date in the future')
        }
        set.expiresAt = settings.expiresAt
      }
      if (settings.maxDownloads !== undefined) {
        const max = settings.maxDownloads
        if (max !== null && (!Number.isInteger(max) || max < 1 || max > MAX_DOWNLOADS)) {
          throw new InvalidInput('The download limit must be a whole number of at least 1')
        }
        set.maxDownloads = max
      }
      return set
    }

    return {
      /** All the Owner's links, newest first. */
      list: () => summaries(undefined),

      /** The link for an Item, if it has one. */
      async forItem(itemId: string): Promise<Share | null> {
        const [found] = await summaries(eq(share.itemId, itemId))
        return found ?? null
      },

      /** Share a File or Folder. Each Item has at most one link. */
      async create(itemId: string, settings: ShareSettings = {}): Promise<Share> {
        if ((await items.describe([itemId])).length === 0) throw new NotFound('Item not found')
        const inserted = await db
          .insert(share)
          .values({
            id: randomUUID(),
            ownerId,
            itemId,
            token: randomBytes(16).toString('base64url'),
            ...(await columns(settings)),
          })
          .onConflictDoNothing({ target: share.itemId })
          .returning({ id: share.id })
        if (inserted.length === 0) throw new Conflict('This already has a share link')
        return one(inserted[0]!.id)
      },

      async update(shareId: string, settings: ShareSettings): Promise<Share> {
        const set = await columns(settings)
        if (Object.keys(set).length > 0) {
          const updated = await db
            .update(share)
            .set(set)
            .where(and(eq(share.id, shareId), eq(share.ownerId, ownerId)))
            .returning({ id: share.id })
          if (updated.length === 0) throw new NotFound('Share link not found')
        }
        return one(shareId)
      },

      /** Stop sharing. The link stops working at once and for good. */
      async revoke(shareId: string): Promise<void> {
        const deleted = await db
          .delete(share)
          .where(and(eq(share.id, shareId), eq(share.ownerId, ownerId)))
          .returning({ id: share.id })
        if (deleted.length === 0) throw new NotFound('Share link not found')
      },
    }
  }
}

function statusOf(
  row: Pick<typeof share.$inferSelect, 'expiresAt' | 'maxDownloads' | 'downloads'>,
  trashedAt: Date | null,
  at: Date,
): ShareStatus {
  if (trashedAt) return 'trashed'
  if (row.expiresAt && row.expiresAt <= at) return 'expired'
  if (row.maxDownloads !== null && row.downloads >= row.maxDownloads) return 'used-up'
  return 'active'
}
