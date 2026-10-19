import { createAuthClient } from 'better-auth/vue'
import { twoFactorClient } from 'better-auth/client/plugins'

/** Browser-side Better Auth client: sign-in, sign-out, password and 2FA flows. */
export const authClient = createAuthClient({ plugins: [twoFactorClient()] })

/** Turn a Better Auth error into a sentence the person can act on. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null): string {
  switch (error?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email and password don’t match an account.'
    case 'BANNED_USER':
      return 'This account has been disabled. Ask the Arca admin to turn it back on.'
    case 'INVALID_PASSWORD':
      return 'That password isn’t right.'
    case 'INVALID_CODE':
    case 'INVALID_TWO_FACTOR_AUTHENTICATION':
      return 'That code didn’t work. Codes change every 30 seconds, so try the current one.'
    case 'INVALID_BACKUP_CODE':
      return 'That backup code isn’t valid or was already used.'
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 10 characters.'
  }
  if (error?.status === 429) return 'Too many attempts. Wait a minute, then try again.'
  return error?.message || 'Something went wrong. Try again.'
}
