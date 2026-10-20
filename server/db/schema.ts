import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
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
    /**
     * The Trash entry this row went to Trash with: the id of the File or Folder that was deleted.
     * Every row of a trashed subtree carries it, so "not trashed" is one column check everywhere.
     */
    trashEntryId: text('trash_entry_id'),
    /** Entry roots only: names of the Folders it was in, from the root down, for restoring. */
    trashedFrom: jsonb('trashed_from').$type<string[]>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('item_sibling_name_uq')
      .on(t.ownerId, sql`coalesce(${t.parentId}, '')`, sql`lower(${t.name})`)
      .where(sql`${t.trashedAt} is null`),
    index('item_owner_parent_idx').on(t.ownerId, t.parentId),
    index('item_blob_idx').on(t.blobHash),
    index('item_trash_entry_idx')
      .on(t.trashEntryId)
      .where(sql`${t.trashEntryId} is not null`),
    // Typo-tolerant name search (pg_trgm).
    index('item_name_trgm_idx').using('gin', sql`lower(${t.name}) gin_trgm_ops`),
    check(
      'item_file_has_blob',
      sql`(${t.kind} = 'folder' and ${t.blobHash} is null) or (${t.kind} = 'file' and ${t.blobHash} is not null)`,
    ),
    check('item_trash_entry_set', sql`(${t.trashedAt} is null) = (${t.trashEntryId} is null)`),
  ],
)

/** Background work (see the Jobs module). A row exists while a job is pending, running or failed. */
export const job = pgTable(
  'job',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Set once retries are exhausted; the row stays for inspection and is never picked again. */
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    /** At most one pending job per key (e.g. one thumbnail job per Blob). */
    dedupeKey: text('dedupe_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('job_due_idx')
      .on(t.runAt)
      .where(sql`${t.failedAt} is null`),
  ],
)

/** Derived thumbnails, per Blob (identical bytes share one Preview). */
export const preview = pgTable('preview', {
  blobHash: text('blob_hash')
    .primaryKey()
    .references(() => blob.hash, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ready', 'failed'] }).notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const TAG_COLORS = ['sage', 'lake', 'plum', 'rose', 'ochre', 'clay', 'slate', 'moss'] as const
export type TagColor = (typeof TAG_COLORS)[number]

/** A flat, coloured, per-Owner label for Files (GLOSSARY: Tag). */
export const tag = pgTable(
  'tag',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color', { enum: TAG_COLORS }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tag_owner_name_uq').on(t.ownerId, sql`lower(${t.name})`)],
)

export const itemTag = pgTable(
  'item_tag',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => item.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index('item_tag_tag_idx').on(t.tagId)],
)
