import { Readable } from 'node:stream'
// Download a File. Supports single byte ranges, so big downloads resume and videos can seek.
// `?inline=1` displays it in the browser instead, but only for types that can't run script.
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/
export default defineApiHandler(async (event) => {
  const library = await useOwnerLibrary(event)
  const { blobStore } = await useArca()
  const file = await library.getFile(getRouterParam(event, 'id')!)
  const inline = getQuery(event).inline === '1' && INLINE_SAFE.test(file.mimeType ?? '')

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
})
