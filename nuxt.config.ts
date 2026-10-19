import tailwindcss from '@tailwindcss/vite'

// E2E builds go to their own directories so they never clobber a running dev server.
const e2e = process.env.ARCA_E2E === '1'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  buildDir: e2e ? '.nuxt-e2e' : '.nuxt',
  modules: ['@nuxt/eslint', '@nuxtjs/color-mode', '@nuxt/fonts', '@nuxt/icon', 'reka-ui/nuxt'],
  css: ['~/assets/css/main.css'],
  // Component names are the file names (UiButton, LibraryView, …); folders are just grouping.
  components: [{ path: '~/components', pathPrefix: false }],
  vite: { plugins: [tailwindcss()] },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    storageKey: 'arca-color-mode',
    disableTransition: true,
  },

  // Downloaded at build time and served from Arca itself — no third-party font requests.
  fonts: {
    families: [{ name: 'Atkinson Hyperlegible Next', provider: 'google', weights: ['400 800'] }],
  },
  // Put icon CSS in a layer so Tailwind size utilities (size-4, …) win over its 1em default.
  icon: { serverBundle: 'local', cssLayer: 'base' },

  app: {
    head: {
      title: 'Arca',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },

  // Every value can be overridden with NUXT_<NAME> env vars, e.g. NUXT_DATABASE_URL.
  runtimeConfig: {
    databaseUrl: 'pglite:./.data/pglite',
    migrationsDir: './server/db/migrations',
    authSecret: '',
    baseUrl: 'http://localhost:3000',
    blobDir: './.data/blobs',
    uploadDir: './.data/uploads',
    previewDir: './.data/previews',
    maxUploadBytes: 64 * 1024 ** 3,
    public: {
      uploadChunkBytes: 50 * 1024 * 1024,
    },
  },

  nitro: { preset: 'node-server', output: { dir: e2e ? '.output-e2e' : '.output' } },
})
