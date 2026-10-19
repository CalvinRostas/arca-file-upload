// Run migrations at startup so a broken config fails loudly instead of on the first request.
export default defineNitroPlugin(() => {
  useArca().catch((error) => {
    console.error('[arca] startup failed:', error)
    process.exitCode = 1
  })
})
