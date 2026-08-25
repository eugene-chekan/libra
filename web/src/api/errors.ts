/** What a failed request throws. */
export class ApiError extends Error {
  /** The HTTP status the server answered with, or 0 when the request never reached it. */
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

/** The sentence to show a reader when a request failed. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Could not reach the server.'
    if (error.status === 403) return 'You are not allowed to do that.'
    if (error.status === 404) return 'That is no longer there.'
    return error.message
  }
  return 'Something went wrong.'
}
