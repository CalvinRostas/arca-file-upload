declare module '#app' {
  interface PageMeta {
    /** Only Admins may open this page (enforced in `auth.global.ts`). */
    admin?: boolean
  }
}

export {}
