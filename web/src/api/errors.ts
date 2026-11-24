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

/** Pulls the sentence out of a FastAPI error body. */
async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
    }
  } catch {
    // Not JSON.
  }
  if (response.status >= 500) return 'The server ran into a problem. Try again in a moment.'
  return `Request failed (${response.status}).`
}

/**
 * The error for a response that was not OK, already written to the console.
 *
 * @param request What was asked, such as `GET /api/books`, for the console line.
 */
export async function responseFailure(request: string, response: Response): Promise<ApiError> {
  const error = new ApiError(response.status, await readDetail(response))
  logFailure(request, error)
  return error
}

/** The error for a request that never reached the server, already written to the console. */
export function networkFailure(request: string): ApiError {
  const error = new ApiError(0, 'Could not reach the server.')
  logFailure(request, error)
  return error
}

/**
 * A network failure or a server fault is an error; any other refusal is a warning. A 401 is not
 * logged: the first request of every visit before signing in gets one.
 */
function logFailure(request: string, error: ApiError): void {
  if (error.status === 401) return
  if (error.status === 0 || error.status >= 500) {
    console.error(`libra: ${request} failed (${error.status}): ${error.message}`)
  } else {
    console.warn(`libra: ${request} was refused (${error.status}): ${error.message}`)
  }
}
