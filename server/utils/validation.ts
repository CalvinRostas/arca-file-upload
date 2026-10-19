import { z } from 'zod'

export const newAccountBody = z.object({
  name: z.string().max(100),
  email: z.string().max(254),
  password: z.string().max(256),
})
