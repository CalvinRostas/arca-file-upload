import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxtjs/color-mode'],
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    storageKey: 'arca-color-mode',
  },

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
    public: {
      uploadChunkBytes: 50 * 1024 * 1024,
    },
  },

  nitro: { preset: 'node-server' },
})
