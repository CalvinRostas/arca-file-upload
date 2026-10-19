import { z } from 'zod'
import { zipStream } from '../../modules/zip'

const query = z.object({ ids: z.string().min(1) })

// Stream a zip of the given Items (and everything inside folders). GET so the browser downloads it.
export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { blobStore } = await useArca()
  const ids = (await getValidatedQuery(event, query.parse)).ids.split(',').slice(0, 10_000)
  const entries = await library.walk(ids)

  const single = ids.length === 1 && entries[0]?.kind === 'folder' ? entries[0].path : null
  setResponseHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition('attachment', `${single ?? 'Arca download'}.zip`),
    'Cache-Control': 'no-store',
  })
  return sendStream(
    event,
    zipStream(entries, (hash) => blobStore.open(hash)),
  )
})
