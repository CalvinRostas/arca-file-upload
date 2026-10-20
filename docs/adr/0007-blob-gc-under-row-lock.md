# ADR-0007: Blob GC and Ingest meet at the Blob row lock

**Status:** Accepted · 2026-10-20

## Context

Blobs are shared and reference-counted (ADR-0003), and the nightly GC deletes the ones no File points at. An Upload of bytes that are already stored doesn't write them again: BlobStore `adopt` sees the hash exists and drops the staged copy. So GC and Ingest can race on the same hash:

1. GC decides a Blob is unreferenced.
2. An Upload of the same bytes finishes: `adopt` sees them on disk and drops its copy, and a File row is inserted.
3. GC deletes the bytes. The new File now points at nothing.

## Decision

The `blob` row is the lock both sides take.

- **Ingest** stores bytes inside `library.addFile`'s transaction (`NewFile.store`), after upserting the Blob row with `ON CONFLICT DO UPDATE`, which holds that row until commit.
- **GC** (`library.collectBlobs`) claims unreferenced rows `FOR UPDATE SKIP LOCKED`, re-checks that they are unreferenced, deletes the bytes and Previews, and then deletes the row, all in one transaction.

Whichever side gets the row first finishes before the other one looks. If GC is first, the Upload's upsert waits, then creates a fresh row, and `adopt` finds no bytes and moves its copy in.

## Consequences

- Don't move `adopt` back out of `addFile`, or insert Files that point at a Blob any other way, without revisiting this.
- If sweeping fails, the transaction rolls back and the row stays, so the next run retries. Any bytes already deleted are harmless: no File points at that Blob, and a later Upload re-adopts.
- A transaction can roll back after `adopt` has run, which leaves bytes on disk with no row. That's rare, it leaks space rather than losing data, and it's left for a future disk sweep.
