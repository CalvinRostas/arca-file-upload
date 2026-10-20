import { createReadStream } from 'node:fs'
import type { H3Event } from 'h3'
import { NotFound } from '../modules/errors'
import type { StoredFile } from '../modules/library'

/** A File's thumbnail; `?size=view` is the large copy made for formats browsers can't display (HEIC, TIFF). */
export async function sendThumbnail(event: H3Event, file: StoredFile) {
  const { previews } = await useArca()
  const size = getQuery(event).size === 'view' ? 'view' : 'thumb'
  const path = await previews.renditionPath(file.blobHash, size)
  if (!path) throw new NotFound('No thumbnail')
  setResponseHeaders(event, {
    'Content-Type': 'image/webp',
    // A File's bytes never change (replacing creates a new File), so neither does its thumbnail.
    'Cache-Control': 'private, max-age=31536000, immutable',
  })
  return sendStream(event, createReadStream(path))
}
