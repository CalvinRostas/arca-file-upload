import type { InjectionKey } from 'vue'

/** Where a File's bytes and thumbnails come from: the Owner's API, or a Share link's. */
export interface FileUrls {
  /** Download. */
  content(id: string): string
  /** View in the browser. */
  preview(id: string): string
  thumbnail(id: string, size?: 'view'): string
}

const key: InjectionKey<FileUrls> = Symbol('file-urls')

function urlsBelow(base: string): FileUrls {
  return {
    content: (id) => `${base}/files/${id}/content`,
    preview: (id) => `${base}/files/${id}/content?inline=1`,
    thumbnail: (id, size) => `${base}/files/${id}/thumbnail${size ? `?size=${size}` : ''}`,
  }
}

const ownerUrls = urlsBelow('/api')

/** For everything below: the Share link's URLs instead of the Owner's. */
export function provideSharedFileUrls(token: string): FileUrls {
  const urls = urlsBelow(`/api/s/${token}`)
  provide(key, urls)
  return urls
}

export function useFileUrls(): FileUrls {
  return inject(key, ownerUrls)
}
