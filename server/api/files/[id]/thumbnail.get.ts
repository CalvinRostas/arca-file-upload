import { createReadStream } from 'node:fs'
import { NotFound } from '../../../modules/errors'

export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { previews } = await useArca()
  const file = await library.getFile(getRouterParam(event, 'id')!)
  const path = await previews.thumbnailPath(file.blobHash)
  if (!path) throw new NotFound('No thumbnail')
  setResponseHeaders(event, {
    'Content-Type': 'image/webp',
    // A File's bytes never change (replacing creates a new File), so neither does its thumbnail.
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(path))
})
