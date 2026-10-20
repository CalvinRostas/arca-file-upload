import type { H3Event } from 'h3'
import type { WalkEntry } from '../modules/library'
import { zipStream } from '../modules/zip'

/** Stream walked entries as a zip, named after the Folder when it's a single one. */
export async function sendZip(event: H3Event, entries: WalkEntry[], roots: number) {
  const { blobStore } = await useArca()
  const single = roots === 1 && entries[0]?.kind === 'folder' ? entries[0].path : null
  setResponseHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition('attachment', `${single ?? 'Arca download'}.zip`),
    'Cache-Control': 'no-store',
  })
  return sendStream(
    event,
    zipStream(entries, (hash) => blobStore.open(hash)),
  )
}
