import { createReadStream } from 'node:fs'
import { NotFound } from '../../../modules/errors'

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { previews } = await useArca()
  const file = await library.getFile(getRouterParam(event, 'id')!)
  // ?size=view: the large copy made for formats browsers can't display (HEIC, TIFF).
  const size = getQuery(event).size === 'view' ? 'view' : 'thumb'
  const path = await previews.renditionPath(file.blobHash, size)
  if (!path) throw new NotFound('No thumbnail')
  setResponseHeaders(event, {
    'Content-Type': 'image/webp',
    // A File's bytes never change (replacing creates a new File), so neither does its thumbnail.
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(path))
})
