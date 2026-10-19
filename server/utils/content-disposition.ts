/** `Content-Disposition` with an ASCII fallback and the exact UTF-8 name (RFC 6266). */
export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
