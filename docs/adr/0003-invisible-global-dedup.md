# ADR-0003: Invisible global dedup, owner-only duplicate notices

**Status:** Accepted · 2026-10-19

## Context

Content-addressed storage saves disk space, and the more widely it is shared, the more it saves. But anything that reveals whether certain bytes already exist on the server lets one Member probe for another Member's files.

## Decision

- Blobs are stored by their SHA-256 and reference-counted **across all Owners**.
- The hash is computed **on the server**, after the bytes arrive. There is no client-side pre-hash that could skip an upload.
- The only user-visible signal is a **Duplicate** notice, shown when the same Owner already has a File with that Blob.

## Consequences

- Uploading a duplicate still transfers the full bytes. That's accepted: hashing 10 GB in a browser takes minutes, and an upload-skip shortcut would leak information.
- Deleting a File never deletes a Blob directly. The nightly GC removes Blobs with zero references.
- Do not add "instant upload if the hash is known" without revisiting this ADR.
