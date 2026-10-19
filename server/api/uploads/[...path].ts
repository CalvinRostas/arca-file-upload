// tus endpoint (ADR-0002). The body streams straight through to the staging file.
export default defineEventHandler(async (event) => {
  const { ingest } = await useArca()
  return ingest.handle(toWebRequest(event))
})
