// The Item's Share link, or null.
export default defineApiHandler(async (event) => (await useOwnerShares(event)).forItem(getRouterParam(event, 'id')!))
