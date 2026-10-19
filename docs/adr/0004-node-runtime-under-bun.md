# ADR-0004: bun for tooling, Node for runtime and tests

**Status:** Accepted · 2026-10-19

## Context

bun is the preferred package manager and script runner. The libraries on the critical path for streaming 10 GB files (`sharp`, `@tus/server`, `pg-boss`, Better Auth with argon2) are developed and tested mainly against Node.

## Decision

- `bun install` and `bun run <script>` handle installing packages and running scripts.
- Production runs on **Node**, using Nitro's `node-server` preset (`node .output/server/index.mjs`).
- Tests run on **Vitest** (the runner `@nuxt/test-utils` expects), not `bun test`.

## Consequences

A stream-compatibility bug in Bun can't silently corrupt a large upload. Trying the bun runtime later is a one-line preset change, but it needs a full ingest test pass first.
