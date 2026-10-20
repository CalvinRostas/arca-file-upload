import { Readable } from 'node:stream'
import type { H3Event } from 'h3'
import type { StoredFile } from '../modules/library'

// Shown in the browser only for types that can't run script; everything else is an attachment.
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/

export interface SendFileOptions {
  /** A preview in the browser rather than a download. */
  preview: boolean
  /** Called once per download (not for previews, or for the later parts of a resumed one). */
  onDownload?: () => Promise<void>
}

/** Send a File's bytes. Supports single byte ranges, so big downloads resume and videos can seek. */
export async function sendStoredFile(event: H3Event, file: StoredFile, options: SendFileOptions) {
  const { blobStore } = await useArca()
  const inline = options.preview && INLINE_SAFE.test(file.mimeType ?? '')

  setResponseHeaders(event, {
    'Accept-Ranges': 'bytes',
    'Content-Type': file.mimeType ?? 'application/octet-stream',
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.name),
    ETag: `"${file.blobHash}"`,
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  })

  if (getRequestHeader(event, 'if-none-match') === `"${file.blobHash}"`) {
    setResponseStatus(event, 304)
    return null
  }

  const range = parseRange(getRequestHeader(event, 'range'), file.size)
  if (range === 'unsatisfiable') {
    setResponseHeader(event, 'Content-Range', `bytes */${file.size}`)
    setResponseStatus(event, 416)
    return null
  }
  if (!options.preview && (!range || range.start === 0)) await options.onDownload?.()
  if (range) {
    setResponseStatus(event, 206)
    setResponseHeaders(event, {
      'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
      'Content-Length': String(range.end - range.start + 1),
    })
    return sendStream(event, await blobStore.open(file.blobHash, range))
  }
  setResponseHeader(event, 'Content-Length', file.size)
  return sendStream(event, file.size === 0 ? Readable.from([]) : await blobStore.open(file.blobHash))
}
