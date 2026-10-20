# Glossary

The domain language of Arca. Use these terms in code, docs, and conversation.

**Arca**: the product. A self-hosted, multi-user file backup and sharing app.

**Owner**: the user a File, Folder, Tag, or Share link belongs to. Every owned row carries an `ownerId`, and all Library access is scoped to one Owner.

**Admin**: the user who runs the instance. Invites and disables Members, purges disabled accounts, and sees instance-wide storage stats. There is exactly one in practice, but the role is a flag, not a special account.

**Member**: an invited user. Sees only their own Library. Has no quota.

**Invite**: a one-time, expiring (7 days) link an Admin generates. Redeeming it creates a Member who picks their own password.

**Library**: one Owner's tree of Folders and Files, plus their Tags and Trash. Also the name of the module that enforces the tree's rules.

**Folder**: a named node in the Library tree. It can contain Folders and Files. Names are unique among siblings.

**Item**: either a File or a Folder; whatever can sit in a Folder. Files and Folders share one name space per Folder.

**File**: what the user sees and names. It has a name, a parent Folder, Tags, and timestamps, and it points at exactly one Blob. Many Files (across all Owners) may point at the same Blob.

**Blob**: the stored bytes, addressed by their SHA-256 hash and reference-counted. Users never see Blobs. A Blob with zero references is garbage-collected.

**Duplicate**: a File whose Blob the same Owner already references through another, non-trashed File. The Owner is told after the Upload completes and may discard the new copy. Dedup across Owners also happens, but it is invisible (see ADR-0003).

**Name collision**: an attempt to put a File or Folder where a sibling already has that name. It is resolved before any bytes are sent: _replace_ (the old item goes to Trash), _keep both_ (auto-rename to `name (1).ext`), or _skip_.

**Upload**: one resumable tus transfer that becomes one File. It is in progress until its last chunk arrives, and it is abandoned (then cleaned up) after 24 h without progress.

**Tag**: a flat, colored, per-Owner label that can be attached to Files (not Folders).

**Trash**: the soft-delete area. A **Trash entry** is one deleted File, or one deleted Folder together with its whole subtree. Entries are purged after 30 days. Restoring puts an entry back in its Folder; if that Folder is gone or in Trash itself, it recreates the path by name, and a name taken in the meantime gets a free one (as with _keep both_). An entry is only restored or deleted as a whole.

**Share link**: an unguessable token URL that grants read-only access to one File or one Folder (live, including its subtree). An Item has at most one. It can have an optional password, expiry (the end of a chosen day), and download limit. It is paused while its target is in Trash, works again once restored, and is deleted with its target. _Revoking_ ("Stop sharing") deletes it for good. Visitors aren't identified: the Owner sees how often it was opened and downloaded and when it was last used, and nothing else.

**Download** (via a Share link): fetching a File's bytes as a file, or a zip. Each counts once against the link's limit; resuming one doesn't. While a link has a download limit, previews in the browser are off (see ADR-0008).

**Preview**: a derived rendition of a File (an image thumbnail now, and video poster frames later). It is generated in the background.
