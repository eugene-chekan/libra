import { ApiError, readDetail } from './errors'
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
  TagCreate,
  TagPatch,
  User,
  UserCreate,
  UserPatch,
} from './types'

/** The prefix every endpoint sits behind. */
const BASE = '/api'

/** The real client. */
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

  async listUsers(): Promise<User[]> {
    return this.send<User[]>('GET', '/users')
  }

  async createUser(user: UserCreate): Promise<User> {
    return this.send<User>('POST', '/users', user)
  }

  async deleteUser(id: number): Promise<void> {
    await this.send<void>('DELETE', `/users/${id}`)
  }

  /**
   * The one request that is not JSON: the boundary has to come from the browser, so no
   * `Content-Type` is set by hand here.
   */
  async uploadBook(file: File): Promise<Book> {
    const body = new FormData()
    body.set('file', file)
    return this.request<Book>('/books/upload', { method: 'POST', credentials: 'include', body })
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

  /**
   * `make_global` is off the URL entirely when false: the endpoint's default is an ordinary
   * create.
   */
  async createTag(tag: TagCreate, makeGlobal = false): Promise<Tag> {
    return this.send<Tag>('POST', makeGlobal ? '/tags?make_global=true' : '/tags', tag)
  }

  async updateTag(id: number, patch: TagPatch): Promise<Tag> {
    return this.send<Tag>('PATCH', `/tags/${id}`, patch)
  }

  async deleteTag(id: number): Promise<void> {
    await this.send<void>('DELETE', `/tags/${id}`)
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

  /**
   * `/shelves/order` is a path of its own — declared before `/shelves/{id}` on the server, so
   * "order" is never read as an id that fails to parse.
   */
  async reorderShelves(shelfIds: number[]): Promise<Shelf[]> {
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

  /**
   * No body at all, not even an empty object: the endpoint takes none, and sending one would
   * put a Content-Type on a request with no content.
   */
  async sendToKindle(id: number): Promise<KindleDelivery> {
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

  /** Every JSON request goes through here. */
  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /** The tail every request shares, JSON or not: the fetch itself, and turning the response into
   *  a value or an {@link ApiError}. */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(BASE + path, init)
    } catch {
      throw new ApiError(0, 'Could not reach the server.')
    }

    if (response.status === 401) this.handler?.()

    if (!response.ok) {
      throw new ApiError(response.status, await readDetail(response))
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }
}
