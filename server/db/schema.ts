import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

// ── Better Auth tables (core + admin + twoFactor plugins) ────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  ...timestamps,
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
    ...timestamps,
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [index('two_factor_secret_idx').on(t.secret), index('two_factor_user_id_idx').on(t.userId)],
)

// ── Arca tables ──────────────────────────────────────────────────────────────

/** One-time, expiring link an Admin hands to a future Member. */
export const invite = pgTable('invite', {
  id: text('id').primaryKey(),
  /** SHA-256 of the token; the token itself is only ever shown once. */
  tokenHash: text('token_hash').notNull().unique(),
  note: text('note'),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  redeemedBy: text('redeemed_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Stored bytes, addressed by SHA-256. Referenced by any number of file Items, across Owners (ADR-0003). */
export const blob = pgTable('blob', {
  hash: text('hash').primaryKey(),
  size: bigint('size', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Files and Folders live in one table so a single index can keep sibling names unique
 * (case-insensitively) across both kinds. `parentId` null means the Owner's root.
 */
export const item = pgTable(
  'item',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnyPgColumn => item.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['folder', 'file'] }).notNull(),
    name: text('name').notNull(),
    blobHash: text('blob_hash').references(() => blob.hash),
    size: bigint('size', { mode: 'number' }),
    mimeType: text('mime_type'),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('item_sibling_name_uq')
      .on(t.ownerId, sql`coalesce(${t.parentId}, '')`, sql`lower(${t.name})`)
      .where(sql`${t.trashedAt} is null`),
    index('item_owner_parent_idx').on(t.ownerId, t.parentId),
    index('item_blob_idx').on(t.blobHash),
    check(
      'item_file_has_blob',
      sql`(${t.kind} = 'folder' and ${t.blobHash} is null) or (${t.kind} = 'file' and ${t.blobHash} is not null)`,
    ),
  ],
)
