export default defineApiHandler(async (event) => (await useOwnerShares(event)).list())
