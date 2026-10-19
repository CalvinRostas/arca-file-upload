import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { schema, type Db } from '../../db'

const { job } = schema

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

export interface EnqueueOptions {
  /** Run no earlier than this. Defaults to now. */
  runAt?: Date
  /** While a job with this key is pending, enqueueing another is a no-op. */
  dedupeKey?: string
}

export interface JobsConfig {
  db: Db
  maxAttempts?: number
  /** How long a claimed job is reserved before another worker may retry it. */
  leaseMs?: number
  pollMs?: number
  log?: (message: string, error?: unknown) => void
}

/**
 * Durable background work in a Postgres table (ADR-0006): enqueue now, run soon, retry with
 * backoff, give up after `maxAttempts`. One worker per process; claims use SKIP LOCKED, so a
 * second instance would be safe too.
 */
export function createJobs(config: JobsConfig) {
  const { db } = config
  const maxAttempts = config.maxAttempts ?? 5
  const leaseMs = config.leaseMs ?? 10 * 60_000
  const pollMs = config.pollMs ?? 2_000
  const log = config.log ?? ((message, error) => console.error(`[jobs] ${message}`, error ?? ''))

  const handlers = new Map<string, JobHandler>()
  const timers: ReturnType<typeof setInterval>[] = []
  let draining: Promise<number> | null = null

  async function claim() {
    const result = await db.execute<{
      id: string
      kind: string
      payload: Record<string, unknown>
      attempts: number
    }>(sql`
      update job set
        locked_until = now() + ${`${leaseMs} milliseconds`}::interval,
        attempts = attempts + 1
      where id = (
        select id from job
        where failed_at is null and run_at <= now() and (locked_until is null or locked_until < now())
        order by run_at
        limit 1
        for update skip locked
      )
      returning id, kind, payload, attempts`)
    return result.rows[0]
  }

  async function runOne(): Promise<boolean> {
    const claimed = await claim()
    if (!claimed) return false
    const handler = handlers.get(claimed.kind)
    try {
      if (!handler) throw new Error(`No handler for job kind "${claimed.kind}"`)
      await handler(claimed.payload)
      await db.delete(job).where(eq(job.id, claimed.id))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (claimed.attempts >= maxAttempts) {
        log(`${claimed.kind} failed for good after ${claimed.attempts} attempts`, error)
        await db
          .update(job)
          .set({ failedAt: new Date(), lockedUntil: null, lastError: message, dedupeKey: null })
          .where(eq(job.id, claimed.id))
      } else {
        const backoffMs = 1000 * 2 ** claimed.attempts
        await db
          .update(job)
          .set({ runAt: new Date(Date.now() + backoffMs), lockedUntil: null, lastError: message })
          .where(eq(job.id, claimed.id))
      }
    }
    return true
  }

  /** Run due jobs until none are left. Returns how many ran. Concurrent calls share one drain. */
  function runDue(): Promise<number> {
    draining ??= (async () => {
      let ran = 0
      try {
        while (await runOne()) ran++
      } finally {
        draining = null
      }
      return ran
    })()
    return draining
  }

  async function enqueue(kind: string, payload: Record<string, unknown> = {}, options: EnqueueOptions = {}) {
    await db
      .insert(job)
      .values({
        id: randomUUID(),
        kind,
        payload,
        runAt: options.runAt ?? new Date(),
        dedupeKey: options.dedupeKey ?? null,
      })
      .onConflictDoNothing({ target: job.dedupeKey })
  }

  return {
    register(kind: string, handler: JobHandler) {
      handlers.set(kind, handler)
    },
    enqueue,
    runDue,

    /** Enqueue `kind` every `everyMs` (and once at start). One pending instance at a time. */
    every(kind: string, everyMs: number) {
      const tick = () => enqueue(kind, {}, { dedupeKey: `every:${kind}` }).catch((e) => log(`schedule ${kind}`, e))
      void tick()
      timers.push(setInterval(tick, everyMs))
    },

    /** Start polling for due jobs. */
    start() {
      timers.push(
        setInterval(() => {
          runDue().catch((e) => log('poll', e))
        }, pollMs),
      )
    },

    stop() {
      for (const timer of timers.splice(0)) clearInterval(timer)
    },
  }
}

export type Jobs = ReturnType<typeof createJobs>
