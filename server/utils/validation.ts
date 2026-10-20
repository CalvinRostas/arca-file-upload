import { z } from 'zod'

export const newAccountBody = z.object({
  name: z.string().max(100),
  email: z.string().max(254),
  password: z.string().max(256),
})

/** Share link settings; a missing field means "leave as is", null means "none". */
export const shareSettingsBody = z.object({
  password: z.string().max(256).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  maxDownloads: z.number().int().nullable().optional(),
})
