/** The message our API put on an error (see `defineApiHandler`), or a fallback. */
export function apiErrorMessage(error: unknown): string {
  const data = (error as { data?: { message?: string } })?.data
  return data?.message || 'Something went wrong. Try again.'
}

/** The stable code our API put on an error (e.g. `password_required`), if any. */
export function apiErrorCode(error: unknown): string | undefined {
  return (error as { data?: { data?: { code?: string } } })?.data?.data?.code
}
