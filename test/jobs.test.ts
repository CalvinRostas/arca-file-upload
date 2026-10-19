import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema, type Database } from '../server/db'
import { createJobs, type Jobs } from '../server/modules/jobs'
import { freshDatabase } from './support/db'

let database: Database
let jobs: Jobs

beforeEach(async () => {
  database = await freshDatabase()
  jobs = createJobs({ db: database.db, maxAttempts: 3, log: () => {} })
})
afterEach(async () => {
  jobs.stop()
  await database.close()
})

const rows = () => database.db.select().from(schema.job)
const makeDue = () => database.db.update(schema.job).set({ runAt: new Date(0) })

describe('jobs', () => {
  it('runs what was enqueued, once, and forgets it', async () => {
    const seen: unknown[] = []
    jobs.register('greet', async (payload) => void seen.push(payload))
    await jobs.enqueue('greet', { name: 'Ada' })
    await jobs.enqueue('greet', { name: 'Bob' })

    expect(await jobs.runDue()).toBe(2)
    expect(seen).toEqual([{ name: 'Ada' }, { name: 'Bob' }])
    expect(await rows()).toEqual([])
    expect(await jobs.runDue()).toBe(0)
  })

  it('waits until runAt', async () => {
    jobs.register('later', async () => {})
    await jobs.enqueue('later', {}, { runAt: new Date(Date.now() + 60_000) })
    expect(await jobs.runDue()).toBe(0)
  })

  it('keeps one pending job per dedupe key', async () => {
    let runs = 0
    jobs.register('thumb', async () => void runs++)
    await jobs.enqueue('thumb', {}, { dedupeKey: 'thumb:abc' })
    await jobs.enqueue('thumb', {}, { dedupeKey: 'thumb:abc' })
    await jobs.runDue()
    expect(runs).toBe(1)
    // Once done, the key is free again.
    await jobs.enqueue('thumb', {}, { dedupeKey: 'thumb:abc' })
    await jobs.runDue()
    expect(runs).toBe(2)
  })

  it('retries with backoff, then gives up and keeps the failure', async () => {
    let attempts = 0
    jobs.register('flaky', async () => {
      attempts++
      throw new Error('disk on fire')
    })
    await jobs.enqueue('flaky', {}, { dedupeKey: 'flaky' })

    await jobs.runDue()
    expect(attempts).toBe(1)
    const [afterFirst] = await rows()
    expect(afterFirst!.runAt.getTime()).toBeGreaterThan(Date.now())
    expect(afterFirst!.lastError).toBe('disk on fire')

    await makeDue()
    await jobs.runDue()
    await makeDue()
    await jobs.runDue()
    expect(attempts).toBe(3)

    await makeDue()
    expect(await jobs.runDue()).toBe(0)
    const [failed] = await rows()
    expect(failed!.failedAt).not.toBeNull()
    // A failed job no longer blocks its key.
    await jobs.enqueue('flaky', {}, { dedupeKey: 'flaky' })
    expect(await rows()).toHaveLength(2)
  })

  it('succeeds on a later attempt', async () => {
    let attempts = 0
    jobs.register('second-time', async () => {
      if (++attempts === 1) throw new Error('not yet')
    })
    await jobs.enqueue('second-time')
    await jobs.runDue()
    await makeDue()
    await jobs.runDue()
    expect(attempts).toBe(2)
    expect(await rows()).toEqual([])
  })

  it('fails jobs nobody handles instead of looping on them', async () => {
    await jobs.enqueue('mystery')
    for (let i = 0; i < 3; i++) {
      await makeDue()
      await jobs.runDue()
    }
    const [row] = await rows()
    expect(row!.failedAt).not.toBeNull()
    expect(row!.lastError).toMatch(/No handler/)
  })
})
