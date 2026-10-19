# ADR-0006: A small in-house job queue instead of pg-boss

**Status:** Accepted · 2026-10-19 (supersedes the pg-boss part of ADR-0001)

## Context

Arca needs background work: thumbnails, cleaning up abandoned Uploads, purging Trash, Blob GC. The original plan was pg-boss. But pg-boss needs a real Postgres connection, and two things we rely on run on PGlite (in-process Postgres): module tests, and local development without Docker.

## Decision

A `job` table and a Jobs module (`server/modules/jobs`):

- claims use `FOR UPDATE SKIP LOCKED` plus a lease
- retries use exponential backoff
- a job fails for good after N attempts and keeps its row for inspection
- an optional dedupe key allows at most one pending job per key
- `every(kind, ms)` handles recurring housekeeping

One worker runs per app process.

## Consequences

- The same code runs on PGlite and Postgres, and it's tested like any other module.
- There is no cron syntax, priorities, or fan-out. Revisit if Arca ever needs several app instances with heavy job load. Even then, SKIP LOCKED claims make a second worker safe.
