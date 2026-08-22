import { ApiError } from './errors'
import type { LibraApi } from './LibraApi'
import type {
  Book,
  BookList,
  BookSearchParams,
  CurrentUser,
  Shelf,
  Tag,
  User,
  UserPatch,
} from './types'

/**
 * A user in the fake, plus the password only the fake knows.
 *
 * The real server stores an Argon2 hash and never sends it anywhere. The fake
 * keeps the plain password because something has to decide whether a login
 * succeeds, and hashing here would test the hash library rather than the
 * client.
 */
export interface FakeUser extends User {
  password: string
}

let nextId = 1

/** Builds a user for a test, with sensible values for everything unstated. */
export function fakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const id = overrides.id ?? nextId++
  return {
    id,
    username: `reader${id}`,
    is_admin: false,
    kindle_email: null,
    created_at: '2026-08-22T10:00:00Z',
    password: 'correct-horse',
    ...overrides,
  }
}

/**
 * `BookRead` flattens shelf and tag membership to the caller's own view, so
 * the fake does the same: `shelf_id` here is "on this shelf, as the signed-in
 * fake user", not a column shared across every reader.
 */
export interface FakeBook extends Book {
  shelf_id: number | null
}

let nextBookId = 1

export function fakeBook(overrides: Partial<FakeBook> = {}): FakeBook {
  const id = overrides.id ?? nextBookId++
  return {
    id,
    title: `Book ${id}`,
    author: 'An Author',
    has_cover: false,
    tag_ids: [],
    rating: 0,
    progress: 0,
    shelf_id: null,
    ...overrides,
  }
}

let nextTagId = 1

export function fakeTag(overrides: Partial<Tag> = {}): Tag {
  const id = overrides.id ?? nextTagId++
  return {
    id,
    name: `tag${id}`,
    owner_id: null,
    is_global: true,
    ...overrides,
  }
}

let nextShelfId = 1

export function fakeShelf(overrides: Partial<Shelf> = {}): Shelf {
  const id = overrides.id ?? nextShelfId++
  return {
    id,
    owner_id: 1,
    owner_username: 'reader1',
    name: `Shelf ${id}`,
    visibility: 'private',
    editable: true,
    ...overrides,
  }
}

interface FakeOptions {
  users?: FakeUser[]
  /** Who is already signed in when the test starts. `null` means nobody. */
  signedInAs?: FakeUser | null
  /** The instance's send-from address, as `/auth/me` reports it. */
  kindleSender?: string | null
  books?: FakeBook[]
  tags?: Tag[]
  shelves?: Shelf[]
}

/**
 * The in-memory server.
 *
 * **It enforces the server's rules, including the surprising ones.** That is a
 * rule from docs/specs/code-style.md, and it was written after a fake that
 * shared the client's misunderstanding turned an integration bug into a
 * passing suite. So this class refuses a login the same way, refuses to let one
 * reader edit another the same way, and treats an absent field in a patch as
 * "leave it alone" rather than "set it to null" — because that is what
 * `exclude_unset=True` does on the other side.
 *
 * What it does not model is the wire: headers, status codes on the way out,
 * JSON encoding. `HttpLibraApi.test.ts` covers that layer, because a fake
 * cannot.
 */
export class FakeLibraApi implements LibraApi {
  private handler: (() => void) | null = null

  readonly users: FakeUser[]
  readonly kindleSender: string | null
  /** Which user the session cookie belongs to. `null` when signed out. */
  signedInId: number | null
  readonly books: FakeBook[]
  readonly tags: Tag[]
  readonly shelves: Shelf[]

  /** Every call this fake has answered, in order. Lets a test count requests. */
  readonly calls: string[] = []

  constructor({
    users = [],
    signedInAs = null,
    kindleSender = null,
    books = [],
    tags = [],
    shelves = [],
  }: FakeOptions = {}) {
    this.users = users
    this.signedInId = signedInAs?.id ?? null
    this.kindleSender = kindleSender
    this.books = books
    this.tags = tags
    this.shelves = shelves
  }

  setOnUnauthorized(handler: (() => void) | null): void {
    this.handler = handler
  }

  async login(username: string, password: string): Promise<User> {
    this.calls.push('login')
    const user = this.users.find((u) => u.username === username && u.password === password)
    if (!user) {
      // One message for a wrong name and a wrong password, exactly as the
      // server does it. The server goes further and verifies against a dummy
      // hash for unknown users so the two cost the same time — there is no
      // timing here to match, but the message must not come apart.
      this.refuse401('Invalid username or password')
    }
    this.signedInId = user.id
    return publicUser(user)
  }

  async logout(): Promise<void> {
    this.calls.push('logout')
    // The endpoint depends on `current_user`, so signing out twice is a 401
    // rather than a quiet success.
    this.requireSession()
    this.signedInId = null
  }

  async me(): Promise<CurrentUser> {
    this.calls.push('me')
    const user = this.requireSession()
    return { ...publicUser(user), kindle_sender: this.kindleSender }
  }

  async updateUser(id: number, patch: UserPatch): Promise<User> {
    this.calls.push(`updateUser:${id}`)
    const caller = this.requireSession()

    // The order matters and is the server's: ownership first, then existence.
    // A reader who is not an admin gets 403 for an id that does not exist,
    // which is right — otherwise the endpoint would tell them which accounts
    // are real.
    if (id !== caller.id && !caller.is_admin) {
      throw new ApiError(403, 'Cannot modify another user')
    }

    const user = this.users.find((u) => u.id === id)
    if (!user) throw new ApiError(404, 'User not found')

    if ('is_admin' in patch && !caller.is_admin) {
      throw new ApiError(403, 'Only an admin can change admin status')
    }
    if ('password' in patch) {
      if (!patch.password) throw new ApiError(422, 'Password must not be empty')
      user.password = patch.password
    }

    // Only the keys that are present. `kindle_email: null` clears it; leaving
    // the key out does nothing.
    if ('kindle_email' in patch) user.kindle_email = patch.kindle_email ?? null
    if ('is_admin' in patch && patch.is_admin !== undefined) user.is_admin = patch.is_admin

    return publicUser(user)
  }

  async listBooks(params: BookSearchParams = {}): Promise<BookList> {
    this.calls.push('listBooks')
    const caller = this.requireSession()
    let matches = this.books

    if (params.tagIds?.length) {
      for (const tagId of params.tagIds) this.requireVisibleTag(tagId, caller)
      const wanted = new Set(params.tagIds)
      matches = matches.filter((book) => book.tag_ids.some((id) => wanted.has(id)))
    }

    if (params.shelfId !== undefined) {
      this.requireVisibleShelf(params.shelfId, caller)
      matches = matches.filter((book) => book.shelf_id === params.shelfId)
    }

    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase()
      matches = matches.filter(
        (book) => book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q)
      )
    }

    // 'added' order is the fake's own insertion order — there is no created_at
    // to sort by here, and this milestone's tests only need the two orders to
    // differ, not to pin an exact timestamp-derived one.
    const items =
      params.sort === 'added'
        ? matches
        : [...matches].sort((a, b) => a.title.localeCompare(b.title))

    return { items, total: items.length }
  }

  async listTags(): Promise<Tag[]> {
    this.calls.push('listTags')
    const caller = this.requireSession()
    return this.tags.filter((tag) => tag.owner_id === null || tag.owner_id === caller.id)
  }

  async listShelves(): Promise<Shelf[]> {
    this.calls.push('listShelves')
    const caller = this.requireSession()
    return this.shelves.filter(
      (shelf) => shelf.owner_id === caller.id || shelf.visibility === 'public'
    )
  }

  coverUrl(id: number): string {
    return `/api/books/${id}/cover`
  }

  /** Mirrors `visible_tag`: 404, not an empty result, for a tag the caller cannot see. */
  private requireVisibleTag(tagId: number, caller: FakeUser): void {
    const tag = this.tags.find((t) => t.id === tagId)
    if (!tag || (tag.owner_id !== null && tag.owner_id !== caller.id)) {
      throw new ApiError(404, 'Tag not found')
    }
  }

  /** Mirrors `_visible_shelf`: 404, not an empty result, for a shelf the caller cannot see. */
  private requireVisibleShelf(shelfId: number, caller: FakeUser): void {
    const shelf = this.shelves.find((s) => s.id === shelfId)
    if (!shelf || (shelf.owner_id !== caller.id && shelf.visibility !== 'public')) {
      throw new ApiError(404, 'Shelf not found')
    }
  }

  private requireSession(): FakeUser {
    const user = this.users.find((u) => u.id === this.signedInId)
    if (!user) this.refuse401('Not authenticated')
    return user
  }

  /** Reports the 401 the way the HTTP client does, then throws it. */
  private refuse401(detail: string): never {
    this.handler?.()
    throw new ApiError(401, detail)
  }
}

/** Drops the fake's own password field, which no endpoint ever returns. */
function publicUser(user: FakeUser): User {
  const { password: _password, ...rest } = user
  return rest
}
