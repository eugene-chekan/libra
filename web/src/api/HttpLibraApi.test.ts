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

  it('sends no query string at all for an empty filter', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], total: 0 }))

    await new HttpLibraApi().listBooks()

    expect(lastFetchCall()[0]).toBe('/api/books')
  })

  it('merges tag ids into one comma-separated tags param, not one per id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], total: 0 }))

    await new HttpLibraApi().listBooks({ q: 'dune', tagIds: [3, 7], shelfId: 2, sort: 'added' })

    const [url] = lastFetchCall()
    const params = new URL(url, 'http://x').searchParams
    expect(params.get('q')).toBe('dune')
    expect(params.get('tags')).toBe('3,7')
    expect(params.get('shelf_id')).toBe('2')
    expect(params.get('sort')).toBe('added')
  })

  it('lists tags and shelves from their own endpoints', async () => {
    // A fresh Response per call — mockResolvedValue would hand back the same
    // instance twice, and a Response body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, [])))
    const api = new HttpLibraApi()

    await api.listTags()
    expect(lastFetchCall()[0]).toBe('/api/tags')

    await api.listShelves()
    expect(lastFetchCall()[0]).toBe('/api/shelves')
  })

  it('builds the cover URL without making a request', () => {
    expect(new HttpLibraApi().coverUrl(42)).toBe('/api/books/42/cover')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads one book from its own path', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 42 }))

    await new HttpLibraApi().getBook(42)

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/books/42')
    expect(init.method).toBe('GET')
  })

  it('patches the catalog and puts the reading state, which are two different endpoints', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { id: 42 })))
    const api = new HttpLibraApi()

    await api.updateBook(42, { title: 'Dune (1965)' })
    let [url, init] = lastFetchCall()
    expect(url).toBe('/api/books/42')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Dune (1965)' })

    await api.setBookState(42, { rating: 5, progress: 0.5 })
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/books/42/state')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ rating: 5, progress: 0.5 })
  })

  it('sends a Kindle delivery request with no body and no Content-Type', async () => {
    // The endpoint takes none. A body would put a Content-Type on a request
    // that has no content, and the destination is never the caller's to send.
    fetchMock.mockResolvedValue(jsonResponse(202, { book_id: 42, sent_to: 'r@kindle.com' }))

    await new HttpLibraApi().sendToKindle(42)

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/books/42/send-to-kindle')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers).toEqual({})
  })

  it('raises the server sentence on a failed delivery, which the button then shows', async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, { detail: 'the mail server refused it' }))

    await expect(new HttpLibraApi().sendToKindle(42)).rejects.toMatchObject({
      status: 502,
      message: 'the mail server refused it',
    })
  })

  it('addresses notes under their book to list and create, and by their own id to delete', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, [])))
    const api = new HttpLibraApi()

    await api.listNotes(42)
    expect(lastFetchCall()[0]).toBe('/api/books/42/notes')

    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(201, { id: 1 })))
    await api.createNote(42, { text: 'A note' })
    let [url, init] = lastFetchCall()
    expect(url).toBe('/api/books/42/notes')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ text: 'A note' })

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await api.deleteNote(1)
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/notes/1')
    expect(init.method).toBe('DELETE')
  })

  it('returns nothing rather than throwing when a 204 has no body to parse', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(new HttpLibraApi().deleteNote(1)).resolves.toBeUndefined()
  })

  it('builds the file URL without making a request, same as the cover URL', () => {
    expect(new HttpLibraApi().fileUrl(42)).toBe('/api/books/42/file')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates, renames and deletes a tag on its own path', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { id: 4 })))
    const api = new HttpLibraApi()

    await api.createTag({ name: 'favourites' })
    let [url, init] = lastFetchCall()
    expect(url).toBe('/api/tags')
    expect(init.method).toBe('POST')
    // No `make_global`: a global tag is admin-only and this client never asks
    // for one, so the query string stays off the URL entirely.
    expect(JSON.parse(init.body as string)).toEqual({ name: 'favourites' })

    await api.createTag({ name: 'sci-fi' }, true)
    ;[url, init] = lastFetchCall()
    // The flag is a query parameter, not part of the body.
    expect(url).toBe('/api/tags?make_global=true')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'sci-fi' })

    await api.updateTag(4, { name: 'lent-out' })
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/tags/4')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'lent-out' })

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await api.deleteTag(4)
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/tags/4')
    expect(init.method).toBe('DELETE')
  })

  it('creates, renames and deletes a shelf on its own path', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { id: 3 })))
    const api = new HttpLibraApi()

    await api.createShelf({ name: 'To Read' })
    let [url, init] = lastFetchCall()
    expect(url).toBe('/api/shelves')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'To Read' })

    await api.updateShelf(3, { visibility: 'public' })
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/shelves/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ visibility: 'public' })

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await api.deleteShelf(3)
    ;[url, init] = lastFetchCall()
    expect(url).toBe('/api/shelves/3')
    expect(init.method).toBe('DELETE')
  })

  it('sends a reorder as one complete list, to the order path rather than an id', async () => {
    // `/shelves/order` is its own route on the server, declared before
    // `/shelves/{id}` so that "order" is never read as an id.
    fetchMock.mockResolvedValue(jsonResponse(200, []))

    await new HttpLibraApi().reorderShelves([3, 1, 2])

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/shelves/order')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ shelf_ids: [3, 1, 2] })
  })

  it('uploads a book as multipart form data, with no JSON Content-Type forced on it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 9, title: 'Dune' }))
    const file = new File(['epub bytes'], 'dune.epub', { type: 'application/epub+zip' })

    await new HttpLibraApi().uploadBook(file)

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/books/upload')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    // No Content-Type header set by hand: the browser has to add the multipart
    // boundary itself, and a hand-set header on a FormData body drops it.
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
  })

  it('raises the server detail on a failed upload, the same as every other request', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(415, { detail: 'Only .epub files are supported in this phase' })
    )

    await expect(new HttpLibraApi().uploadBook(new File(['x'], 'notes.pdf'))).rejects.toMatchObject(
      {
        status: 415,
        message: 'Only .epub files are supported in this phase',
      }
    )
  })

  it('lists users from their own endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []))

    await new HttpLibraApi().listUsers()

    expect(lastFetchCall()[0]).toBe('/api/users')
  })

  it('creates a user as JSON, including the admin flag', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 9, username: 'new' }))

    await new HttpLibraApi().createUser({ username: 'new', password: 'x', is_admin: true })

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/users')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      username: 'new',
      password: 'x',
      is_admin: true,
    })
  })

  it('deletes a user on their own path', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await new HttpLibraApi().deleteUser(9)

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/users/9')
    expect(init.method).toBe('DELETE')
  })

  it('raises the duplicate-name sentence the server sends back', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { detail: 'You already have a shelf with that name' })
    )

    await expect(new HttpLibraApi().createShelf({ name: 'To Read' })).rejects.toMatchObject({
      status: 409,
      message: 'You already have a shelf with that name',
    })
  })
})
