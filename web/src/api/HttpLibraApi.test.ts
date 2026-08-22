import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from './errors'
import { HttpLibraApi } from './HttpLibraApi'

/**
 * The wire layer. `FakeLibraApi` covers every rule above the network — this
 * is the one place that checks the network itself: the URL each method hits,
 * the method, the body, the cookie policy, and how a `Response` becomes
 * either a value or an `ApiError`. A fake cannot cover this by construction,
 * because it never touches `fetch`.
 */
describe('HttpLibraApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function jsonResponse(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /** The arguments `fetch` was last called with, typed rather than `any[] | undefined`. */
  function lastFetchCall(): [string, RequestInit] {
    const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined
    if (!call) throw new Error('fetch was never called')
    return call
  }

  it('logs in against the right endpoint, with the credentials as JSON', async () => {
    const user = { id: 1, username: 'eugene', is_admin: false, kindle_email: null, created_at: 'x' }
    fetchMock.mockResolvedValue(jsonResponse(200, user))

    const result = await new HttpLibraApi().login('eugene', 'correct-horse')

    expect(result).toEqual(user)
    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/auth/login')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'eugene',
      password: 'correct-horse',
    })
  })

  it('sends the session cookie on every request, so it works from a different Vite port too', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await new HttpLibraApi().me()

    expect(lastFetchCall()[1]).toMatchObject({ credentials: 'include' })
  })

  it('sends no body and no Content-Type for a GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await new HttpLibraApi().me()

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/auth/me')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({})
  })

  it('PATCHes only the given fields to /api/users/{id}', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: 5,
        username: 'r',
        is_admin: false,
        kindle_email: 'r@kindle.com',
        created_at: 'x',
      })
    )

    await new HttpLibraApi().updateUser(5, { kindle_email: 'r@kindle.com' })

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/users/5')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ kindle_email: 'r@kindle.com' })
  })

  it('treats 204 as success with no body, rather than trying to parse one', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(new HttpLibraApi().logout()).resolves.toBeUndefined()
  })

  it('raises the server detail on a JSON error body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid username or password' }))

    await expect(new HttpLibraApi().login('eugene', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid username or password',
    })
  })

  it('falls back to a status line when the error body is not the shape it expects', async () => {
    // FastAPI's validation errors answer `{"detail": [...]}` — a list, not a
    // string — and a body that is not JSON at all reaches here the same way.
    fetchMock.mockResolvedValue(jsonResponse(422, { detail: [{ msg: 'field required' }] }))

    await expect(new HttpLibraApi().me()).rejects.toMatchObject({
      status: 422,
      message: 'Request failed (422).',
    })
  })

  it('reports a network failure as ApiError(0), not a thrown TypeError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    const error: unknown = await new HttpLibraApi().me().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
  })

  it('fires the registered handler on every 401, including a rejected login', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid username or password' }))
    const api = new HttpLibraApi()
    const handler = vi.fn()
    api.setOnUnauthorized(handler)

    await api.login('eugene', 'wrong').catch(() => {})

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops calling a handler once it has been replaced with null', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Not authenticated' }))
    const api = new HttpLibraApi()
    const handler = vi.fn()
    api.setOnUnauthorized(handler)
    api.setOnUnauthorized(null)

    await api.me().catch(() => {})

    expect(handler).not.toHaveBeenCalled()
  })
})
