import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuth, type Auth, type NewAccount } from '../server/modules/auth'
import { Forbidden, InvalidInput, InviteInvalid, SetupAlreadyDone, Unauthenticated } from '../server/modules/errors'
import { freshDatabase } from './support/db'

const baseUrl = 'http://localhost:3000'
const secret = 'test-secret-test-secret-test-secret-123'

const admin: NewAccount = { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' }
const member: NewAccount = { name: 'Bob', email: 'bob@example.com', password: 'another long password' }

/** Turn the Set-Cookie headers from a sign-in into request headers carrying that session. */
function sessionHeaders(setCookies: Headers): Headers {
  const cookie = setCookies
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return new Headers({ cookie })
}

let close: () => Promise<void>
let auth: Auth

async function setup(inviteTtlMs?: number) {
  const database = await freshDatabase()
  close = database.close
  auth = createAuth({ db: database.db, secret, baseUrl, inviteTtlMs })
}

beforeEach(() => setup())
afterEach(() => close())

describe('first-run setup', () => {
  it('creates the first admin and signs them in', async () => {
    expect(await auth.needsSetup()).toBe(true)
    const headers = sessionHeaders(await auth.completeSetup(admin))

    expect(await auth.needsSetup()).toBe(false)
    await expect(auth.requireAdmin(headers)).resolves.toMatchObject({ email: 'ada@example.com', role: 'admin' })
  })

  it('only works once', async () => {
    await auth.completeSetup(admin)
    await expect(auth.completeSetup(member)).rejects.toThrow(SetupAlreadyDone)
  })

  it('rejects short passwords', async () => {
    await expect(auth.completeSetup({ ...admin, password: 'short' })).rejects.toThrow(InvalidInput)
    expect(await auth.needsSetup()).toBe(true)
  })
})

describe('sessions', () => {
  it('treats a request without a session as anonymous', async () => {
    expect(await auth.currentUser(new Headers())).toBeNull()
    await expect(auth.requireUser(new Headers())).rejects.toThrow(Unauthenticated)
  })

  it('does not let public sign-up bypass invites', async () => {
    const response = await auth.handler(
      new Request(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify(member),
      }),
    )
    expect(response.ok).toBe(false)
    expect(await auth.needsSetup()).toBe(true)
  })
})

describe('invites', () => {
  async function adminUser() {
    return auth.requireAdmin(sessionHeaders(await auth.completeSetup(admin)))
  }

  it('turns a valid invite into a signed-in member', async () => {
    const { token } = await auth.createInvite(await adminUser(), { note: 'for Bob' })
    expect(await auth.isInviteRedeemable(token)).toBe(true)

    const headers = sessionHeaders(await auth.redeemInvite(token, member))
    await expect(auth.requireUser(headers)).resolves.toMatchObject({ email: 'bob@example.com', role: 'member' })
    await expect(auth.requireAdmin(headers)).rejects.toThrow(Forbidden)

    const [invite] = await auth.listInvites()
    expect(invite).toMatchObject({ note: 'for Bob', status: 'redeemed', redeemedBy: { email: 'bob@example.com' } })
  })

  it('can only be used once', async () => {
    const { token } = await auth.createInvite(await adminUser())
    await auth.redeemInvite(token, member)
    await expect(auth.redeemInvite(token, { ...member, email: 'eve@example.com' })).rejects.toThrow(InviteInvalid)
  })

  it('is not burned by invalid input', async () => {
    const { token } = await auth.createInvite(await adminUser())
    await expect(auth.redeemInvite(token, { ...member, email: 'ada@example.com' })).rejects.toThrow(InvalidInput)
    await expect(auth.redeemInvite(token, member)).resolves.toBeInstanceOf(Headers)
  })

  it('expires', async () => {
    await close()
    await setup(-1)
    const { token, invite } = await auth.createInvite(await adminUser())
    expect(invite.status).toBe('expired')
    expect(await auth.isInviteRedeemable(token)).toBe(false)
    await expect(auth.redeemInvite(token, member)).rejects.toThrow(InviteInvalid)
  })

  it('can be revoked while pending', async () => {
    const { token, invite } = await auth.createInvite(await adminUser())
    await auth.revokeInvite(invite.id)
    expect(await auth.listInvites()).toEqual([])
    await expect(auth.redeemInvite(token, member)).rejects.toThrow(InviteInvalid)
  })

  it('rejects unknown tokens', async () => {
    await adminUser()
    await expect(auth.redeemInvite('nope', member)).rejects.toThrow(InviteInvalid)
  })
})

describe('disabling members', () => {
  it('signs them out everywhere and blocks sign-in until re-enabled', async () => {
    const ada = await auth.requireAdmin(sessionHeaders(await auth.completeSetup(admin)))
    const { token } = await auth.createInvite(ada)
    const bobHeaders = sessionHeaders(await auth.redeemInvite(token, member))
    const bob = await auth.requireUser(bobHeaders)

    await auth.setMemberDisabled(ada, bob.id, true)
    await expect(auth.requireUser(bobHeaders)).rejects.toThrow(Unauthenticated)

    const signIn = () =>
      auth.handler(
        new Request(`${baseUrl}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: baseUrl },
          body: JSON.stringify({ email: member.email, password: member.password }),
        }),
      )
    expect((await signIn()).ok).toBe(false)

    await auth.setMemberDisabled(ada, bob.id, false)
    expect((await signIn()).ok).toBe(true)

    const members = await auth.listMembers()
    expect(members.map((m) => [m.email, m.role, m.disabled])).toEqual([
      ['ada@example.com', 'admin', false],
      ['bob@example.com', 'member', false],
    ])
  })

  it("won't let an admin disable themselves", async () => {
    const ada = await auth.requireAdmin(sessionHeaders(await auth.completeSetup(admin)))
    await expect(auth.setMemberDisabled(ada, ada.id, true)).rejects.toThrow(InvalidInput)
  })
})
