import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, twoFactor } from 'better-auth/plugins'
import { and, asc, count, desc, eq, gt, isNull } from 'drizzle-orm'
import { schema, type Db } from '../../db'
import { Forbidden, InvalidInput, InviteInvalid, NotFound, SetupAlreadyDone, Unauthenticated } from '../errors'

export interface AuthConfig {
  db: Db
  /** At least 32 random characters; signs session cookies. */
  secret: string
  /** Public origin, e.g. `https://arca.example.com`. */
  baseUrl: string
  inviteTtlMs?: number
}

export type Role = 'admin' | 'member'

/** The signed-in person, as every other module sees them. */
export interface User {
  id: string
  name: string
  email: string
  role: Role
  twoFactorEnabled: boolean
}

export interface Member extends User {
  disabled: boolean
  createdAt: Date
}

export interface InviteSummary {
  id: string
  note: string | null
  createdAt: Date
  expiresAt: Date
  status: 'pending' | 'expired' | 'redeemed'
  redeemedBy: { name: string; email: string } | null
}

export interface NewAccount {
  name: string
  email: string
  password: string
}

/**
 * Who is calling and what they may do. Wraps Better Auth so no other module touches it.
 *
 * Callers pass plain `Headers` (from the incoming request); methods that sign someone in
 * return the `Set-Cookie` headers to forward on the response.
 */
export type Auth = ReturnType<typeof createAuth>

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_PASSWORD_LENGTH = 10

export function createAuth(config: AuthConfig) {
  const { db } = config
  const inviteTtlMs = config.inviteTtlMs ?? DEFAULT_INVITE_TTL_MS

  const betterAuthInstance = betterAuth({
    appName: 'Arca',
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: [config.baseUrl],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Accounts only come from first-run setup or an Invite.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    },
    plugins: [admin({ defaultRole: 'user', adminRoles: ['admin'] }), twoFactor({ issuer: 'Arca' })],
  })

  const api = betterAuthInstance.api

  async function createAccount(account: NewAccount, role: Role) {
    const name = account.name.trim()
    const email = account.email.trim().toLowerCase()
    if (!name) throw new InvalidInput('Name is required')
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new InvalidInput('Enter a valid email address')
    if (account.password.length < MIN_PASSWORD_LENGTH) {
      throw new InvalidInput(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    }
    const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email))
    if (existing) throw new InvalidInput('An account with this email already exists')

    // Server-side call without request headers: Better Auth's admin plugin allows it.
    // Better Auth's built-in role for non-admins is 'user'; outside this module it's 'member'.
    const { user } = await api.createUser({
      body: { name, email, password: account.password, role: role === 'admin' ? 'admin' : 'user' },
    })
    return { user, email }
  }

  async function signIn(email: string, password: string): Promise<Headers> {
    const { headers } = await api.signInEmail({ body: { email, password }, returnHeaders: true })
    return headers
  }

  async function currentUser(headers: Headers): Promise<User | null> {
    const result = await api.getSession({ headers })
    if (!result) return null
    const { id, name, email, role, twoFactorEnabled } = result.user
    return { id, name, email, role: role === 'admin' ? 'admin' : 'member', twoFactorEnabled: twoFactorEnabled === true }
  }

  async function requireUser(headers: Headers): Promise<User> {
    const user = await currentUser(headers)
    if (!user) throw new Unauthenticated()
    return user
  }

  async function needsSetup(): Promise<boolean> {
    const [row] = await db.select({ n: count() }).from(schema.user)
    return (row?.n ?? 0) === 0
  }

  return {
    /** Mount at `/api/auth/**`. Handles sign-in, sign-out, sessions and TOTP. */
    handler: (request: Request) => betterAuthInstance.handler(request),

    currentUser,
    requireUser,

    async requireAdmin(headers: Headers): Promise<User> {
      const user = await requireUser(headers)
      if (user.role !== 'admin') throw new Forbidden('Admins only')
      return user
    },

    // ── First run ──────────────────────────────────────────────────────────

    needsSetup,

    /** Creates the first Admin and signs them in. Only works while no user exists. */
    async completeSetup(account: NewAccount): Promise<Headers> {
      if (!(await needsSetup())) throw new SetupAlreadyDone()
      const { email } = await createAccount(account, 'admin')
      return signIn(email, account.password)
    },

    // ── Invites ────────────────────────────────────────────────────────────

    /** Returns the raw token exactly once; only its hash is stored. */
    async createInvite(by: User, options: { note?: string } = {}): Promise<{ token: string; invite: InviteSummary }> {
      if (by.role !== 'admin') throw new Forbidden('Admins only')
      const token = randomBytes(24).toString('base64url')
      const [row] = await db
        .insert(schema.invite)
        .values({
          id: randomUUID(),
          tokenHash: hashToken(token),
          note: options.note?.trim() || null,
          createdBy: by.id,
          expiresAt: new Date(Date.now() + inviteTtlMs),
        })
        .returning()
      return { token, invite: summarizeInvite(row!, null) }
    },

    async listInvites(): Promise<InviteSummary[]> {
      const rows = await db
        .select({ invite: schema.invite, redeemer: { name: schema.user.name, email: schema.user.email } })
        .from(schema.invite)
        .leftJoin(schema.user, eq(schema.invite.redeemedBy, schema.user.id))
        .orderBy(desc(schema.invite.createdAt))
      return rows.map((r) => summarizeInvite(r.invite, r.redeemer))
    },

    async revokeInvite(id: string): Promise<void> {
      const deleted = await db
        .delete(schema.invite)
        .where(and(eq(schema.invite.id, id), isNull(schema.invite.redeemedAt)))
        .returning({ id: schema.invite.id })
      if (deleted.length === 0) throw new NotFound('Invite not found')
    },

    /** Lets the invite page say "this link is dead" before asking for a password. */
    async isInviteRedeemable(token: string): Promise<boolean> {
      return (await findRedeemableInvite(token)) !== undefined
    },

    /** Creates a Member from a valid Invite and signs them in. */
    async redeemInvite(token: string, account: NewAccount): Promise<Headers> {
      const invite = await findRedeemableInvite(token)
      if (!invite) throw new InviteInvalid()

      // Claim first so two concurrent redemptions can't both succeed.
      const claimed = await db
        .update(schema.invite)
        .set({ redeemedAt: new Date() })
        .where(and(eq(schema.invite.id, invite.id), isNull(schema.invite.redeemedAt)))
        .returning({ id: schema.invite.id })
      if (claimed.length === 0) throw new InviteInvalid()

      let created: Awaited<ReturnType<typeof createAccount>>
      try {
        created = await createAccount(account, 'member')
      } catch (error) {
        // Bad input shouldn't burn the invite.
        await db.update(schema.invite).set({ redeemedAt: null }).where(eq(schema.invite.id, invite.id))
        throw error
      }
      await db.update(schema.invite).set({ redeemedBy: created.user.id }).where(eq(schema.invite.id, invite.id))
      return signIn(created.email, account.password)
    },

    // ── Members ────────────────────────────────────────────────────────────

    async listMembers(): Promise<Member[]> {
      const rows = await db.select().from(schema.user).orderBy(asc(schema.user.createdAt))
      return rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role === 'admin' ? 'admin' : 'member',
        disabled: u.banned === true,
        twoFactorEnabled: u.twoFactorEnabled === true,
        createdAt: u.createdAt,
      }))
    },

    /**
     * A disabled Member can't sign in and is signed out everywhere. Their files stay until
     * an Admin purges them explicitly.
     */
    async setMemberDisabled(by: User, memberId: string, disabled: boolean): Promise<void> {
      if (by.role !== 'admin') throw new Forbidden('Admins only')
      if (memberId === by.id) throw new InvalidInput("You can't disable your own account")
      const updated = await db
        .update(schema.user)
        .set({ banned: disabled, banReason: disabled ? 'Disabled by admin' : null })
        .where(eq(schema.user.id, memberId))
        .returning({ id: schema.user.id })
      if (updated.length === 0) throw new NotFound('Member not found')
      if (disabled) await db.delete(schema.session).where(eq(schema.session.userId, memberId))
    },
  }

  async function findRedeemableInvite(token: string) {
    const [invite] = await db
      .select()
      .from(schema.invite)
      .where(
        and(
          eq(schema.invite.tokenHash, hashToken(token)),
          isNull(schema.invite.redeemedAt),
          gt(schema.invite.expiresAt, new Date()),
        ),
      )
    return invite
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function summarizeInvite(
  row: typeof schema.invite.$inferSelect,
  redeemer: { name: string; email: string } | null,
): InviteSummary {
  const status = row.redeemedAt ? 'redeemed' : row.expiresAt <= new Date() ? 'expired' : 'pending'
  return {
    id: row.id,
    note: row.note,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status,
    redeemedBy: redeemer,
  }
}
