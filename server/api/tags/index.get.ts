export default defineApiHandler(async (event) => (await useOwnerScope(event)).tags.list())
