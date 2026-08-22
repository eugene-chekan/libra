/**
 * What a failed request throws.
 *
 * One error type for the whole client. The alternative — every call site
 * checking a response object — is how a project ends up with four different
 * ways of asking "did that work?", and the screens then disagree about which
 * one they handle.
 */
export class ApiError extends Error {
  /**
   * The HTTP status the server answered with, or 0 when the request never
   * reached it. Zero is not a status the server can send, so it is safe to use
   * for "the network failed", and it keeps every failure one type instead of
   * two.
   */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** True when the request was refused because there is no valid session. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/**
 * The sentence to show a reader when a request failed.
 *
 * The server's own `detail` is written for whoever is calling the API, and it
 * is sometimes exactly wrong for a reader — `POST /api/auth/login` answers
 * "Invalid username or password", which a login screen must not repeat,
 * because it is the screen's job to say the same thing for both. So screens
 * that have their own copy use it, and everything else falls back to here.
 */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Could not reach the server.'
    if (error.status === 403) return 'You are not allowed to do that.'
    if (error.status === 404) return 'That is no longer there.'
    return error.message
  }
  return 'Something went wrong.'
}
