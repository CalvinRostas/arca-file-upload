import { z } from 'zod'

const body = shareSettingsBody.extend({ itemId: z.string() })

export default defineApiHandler(async (event) => {
  const shares = await useOwnerShares(event)
  const { itemId, ...settings } = await readValidatedBody(event, body.parse)
  return shares.create(itemId, settings)
})
