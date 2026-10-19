const ARCHIVES = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i
const DISK_IMAGES = /\.(dmg|iso|img|vhdx?|vmdk|qcow2)$/i
const CODE = /\.(js|ts|vue|py|rb|go|rs|java|c|cpp|h|css|html|json|ya?ml|toml|sh)$/i

/** Icon for a File, from its type and name. */
export function fileIcon(name: string, mimeType: string | null): string {
  const type = mimeType ?? ''
  if (type.startsWith('image/')) return 'lucide:image'
  if (type.startsWith('video/')) return 'lucide:film'
  if (type.startsWith('audio/')) return 'lucide:music'
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'lucide:file-text'
  if (ARCHIVES.test(name)) return 'lucide:file-archive'
  if (DISK_IMAGES.test(name)) return 'lucide:hard-drive'
  if (CODE.test(name)) return 'lucide:file-code'
  if (type.startsWith('text/')) return 'lucide:file-text'
  return 'lucide:file'
}

/** "pdf", "jpg" — shown under the icon. Empty when there's no sensible extension. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 && name.length - dot <= 6 ? name.slice(dot + 1).toLowerCase() : ''
}

export type ViewerKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'thumbnail' | 'none'

const INLINE_IMAGE = /^image\/(png|jpeg|gif|webp|avif)$/
const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|toml|javascript|x-sh))/
const TEXT_NAMES =
  /\.(txt|md|markdown|csv|log|ini|conf|env|json|ya?ml|toml|xml|js|ts|vue|py|rb|go|rs|java|c|cpp|h|css|html|sh)$/i
const MAX_TEXT_PREVIEW = 2 * 1024 * 1024

/** How the file viewer can show this File. Mirrors what the server allows inline. */
export function viewerKind(item: {
  name: string
  mimeType: string | null
  size: number | null
  thumbnail: boolean
}): ViewerKind {
  const type = item.mimeType ?? ''
  if (INLINE_IMAGE.test(type)) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type === 'application/pdf') return 'pdf'
  if ((TEXT_TYPES.test(type) || TEXT_NAMES.test(item.name)) && (item.size ?? 0) <= MAX_TEXT_PREVIEW) return 'text'
  // SVG, TIFF, …: show the rasterized thumbnail rather than the original.
  if (item.thumbnail) return 'thumbnail'
  return 'none'
}
