import { ApiError } from './errors'
import type { LibraApi } from './LibraApi'
import type {
  Book,
  BookList,
  BookPatch,
  BookSearchParams,
  BookStateWrite,
  CurrentUser,
  KindleDelivery,
  Note,
  NoteDraft,
  Shelf,
  ShelfCreate,
  ShelfPatch,
  Tag,
  User,
  UserPatch,
} from './types'

/**
 * The prefix every endpoint sits behind.
 *
 * Relative, with no host in it, and that is the whole local-first story in one
 * line: the client asks whichever machine served the page. Open the app at
 * `http://kitchen-pi:8000` and it calls `http://kitchen-pi:8000/api/...`
 * without being rebuilt. A host compiled in here would have to be.
 *
 * The `/api` part is not decoration either. Routing is on real paths, so
 * `/shelves` is a page; without the prefix it would also be an endpoint, and
 * reloading the page would hand the reader raw JSON. See
 * docs/specs/client-stack.md.
 */
const BASE = '/api'

/** The real client. One instance for the whole application. */
export class HttpLibraApi implements LibraApi {
  private handler: (() => void) | null = null

  setOnUnauthorized(handler: (() => void) | null): void {
    this.handler = handler
  }

  async login(username: string, password: string): Promise<User> {
    return this.send<User>('POST', '/auth/login', { username, password })
  }

  async logout(): Promise<void> {
    await this.send<void>('POST', '/auth/logout')
  }

  async me(): Promise<CurrentUser> {
    return this.send<CurrentUser>('GET', '/auth/me')
  }

  async updateUser(id: number, patch: UserPatch): Promise<User> {
    return this.send<User>('PATCH', `/users/${id}`, patch)
  }

  async listBooks(params: BookSearchParams = {}): Promise<BookList> {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (params.tagIds?.length) query.set('tags', params.tagIds.join(','))
    if (params.shelfId !== undefined) query.set('shelf_id', String(params.shelfId))
    if (params.sort) query.set('sort', params.sort)
    const qs = query.toString()
    return this.send<BookList>('GET', qs ? `/books?${qs}` : '/books')
  }

  async listTags(): Promise<Tag[]> {
    return this.send<Tag[]>('GET', '/tags')
  }

  async listShelves(): Promise<Shelf[]> {
    return this.send<Shelf[]>('GET', '/shelves')
  }

  async createShelf(shelf: ShelfCreate): Promise<Shelf> {
    return this.send<Shelf>('POST', '/shelves', shelf)
  }

  async updateShelf(id: number, patch: ShelfPatch): Promise<Shelf> {
    return this.send<Shelf>('PATCH', `/shelves/${id}`, patch)
  }

  async deleteShelf(id: number): Promise<void> {
    await this.send<void>('DELETE', `/shelves/${id}`)
  }

  async reorderShelves(shelfIds: number[]): Promise<Shelf[]> {
    // `/shelves/order` is declared before `/shelves/{id}` on the server, so
    // "order" is a path of its own rather than an id that fails to parse.
    return this.send<Shelf[]>('PUT', '/shelves/order', { shelf_ids: shelfIds })
  }

  coverUrl(id: number): string {
    return `${BASE}/books/${id}/cover`
  }

  async getBook(id: number): Promise<Book> {
    return this.send<Book>('GET', `/books/${id}`)
  }

  async updateBook(id: number, patch: BookPatch): Promise<Book> {
    return this.send<Book>('PATCH', `/books/${id}`, patch)
  }

  async setBookState(id: number, state: BookStateWrite): Promise<Book> {
    return this.send<Book>('PUT', `/books/${id}/state`, state)
  }

  async sendToKindle(id: number): Promise<KindleDelivery> {
    // No body at all, not even an empty object: the endpoint takes none, and
    // sending one would put a Content-Type on a request that has no content.
    return this.send<KindleDelivery>('POST', `/books/${id}/send-to-kindle`)
  }

  async listNotes(bookId: number): Promise<Note[]> {
    return this.send<Note[]>('GET', `/books/${bookId}/notes`)
  }

  async createNote(bookId: number, note: NoteDraft): Promise<Note> {
    return this.send<Note>('POST', `/books/${bookId}/notes`, note)
  }

  async deleteNote(noteId: number): Promise<void> {
    await this.send<void>('DELETE', `/notes/${noteId}`)
  }

  fileUrl(id: number): string {
    return `${BASE}/books/${id}/file`
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(BASE + path, {
        method,
        // The session is a cookie, so it has to be sent. `include` rather than
        // `same-origin` because the app can also be run from Vite's own port
        // during development, where the browser counts the backend as a
        // different origin and would otherwise drop the cookie.
        credentials: 'include',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      // `fetch` only rejects when the request never got an answer: the server
      // is down, the network is gone, or a CORS preflight was blocked. All
      // three look identical from here, which is exactly why the CORS setting
      // is documented in web/README.md.
      throw new ApiError(0, 'Could not reach the server.')
    }

    if (response.status === 401) this.handler?.()

    if (!response.ok) {
      throw new ApiError(response.status, await readDetail(response))
    }

    // 204 has no body at all, and asking for one throws. `logout` and
    // `deleteNote` both answer this way, and every later endpoint that does
    // gets it for free.
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}

/**
 * Pulls the sentence out of a FastAPI error body.
 *
 * FastAPI answers `{"detail": "..."}` for the errors this client raises by
 * hand, and `{"detail": [ ...field errors... ]}` for a body it could not
 * validate. Only the first is worth showing, so the second falls back to the
 * status. Anything that is not JSON at all — a proxy's own error page, say —
 * falls back the same way.
 */
async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
    }
  } catch {
    // Not JSON. Fall through.
  }
  return `Request failed (${response.status}).`
}
