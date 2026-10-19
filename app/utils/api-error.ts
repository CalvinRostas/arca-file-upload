/** The message our API put on an error (see `defineApiHandler`), or a fallback. */
export function apiErrorMessage(error: unknown): string {
  const data = (error as { data?: { message?: string } })?.data
  return data?.message || 'Something went wrong. Try again.'
}
