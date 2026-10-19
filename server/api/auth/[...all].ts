export default defineEventHandler(async (event) => {
  const { auth } = await useArca()
  return auth.handler(toWebRequest(event))
})
