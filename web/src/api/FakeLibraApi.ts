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
 * `BookRead` flattens shelf, tag and rating into one object, so the fake keeps
 * one object too. What it does not keep is a second reader: `shelf_id`,
 * `rating` and `progress` here mean "as the signed-in fake user", and there is
 * only ever one of those in a component test.
 */
export type FakeBook = Book

let nextBookId = 1

export function fakeBook(overrides: Partial<FakeBook> = {}): FakeBook {
  const id = overrides.id ?? nextBookId++
  return {
    id,
    title: `Book ${id}`,
    author: 'An Author',
    format: 'epub',
    year: null,
    blurb: null,
    pages: null,
    has_cover: false,
    tag_ids: [],
    shelf_id: null,
    rating: 0,
    progress: 0,
    last_sent_at: null,
    ...overrides,
  }
}

/** A note in the fake, plus the owner the API never publishes. */
export interface FakeNote extends Note {
  /** Whose note it is. `NoteRead` omits this — every note a caller can read is their own. */
  user_id: number
}

let nextNoteId = 1

export function fakeNote(overrides: Partial<FakeNote> = {}): FakeNote {
  const id = overrides.id ?? nextNoteId++
  return {
    id,
    user_id: 1,
    book_id: 1,
    text: `Note ${id}`,
    page: null,
    created_at: '2026-08-22T10:00:00Z',
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
  notes?: FakeNote[]
  /**
   * What the mail server does with the next send. `null` accepts it; a string
   * is the sentence a 502 comes back with, which is what the Send to Kindle
   * button prints after "Couldn't send — ".
   */
  kindleFailure?: string | null
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
  readonly notes: FakeNote[]
  /** Settable mid-test, so one send can fail and the next succeed. */
  kindleFailure: string | null

  /** Every call this fake has answered, in order. Lets a test count requests. */
  readonly calls: string[] = []

  constructor({
    users = [],
    signedInAs = null,
    kindleSender = null,
    books = [],
    tags = [],
    shelves = [],
    notes = [],
    kindleFailure = null,
  }: FakeOptions = {}) {
    this.users = users
    this.signedInId = signedInAs?.id ?? null
    this.kindleSender = kindleSender
    this.books = books
    this.tags = tags
    this.shelves = shelves
    this.notes = notes
    this.kindleFailure = kindleFailure
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

  fileUrl(id: number): string {
    return `/api/books/${id}/file`
  }

  async getBook(id: number): Promise<Book> {
    this.calls.push(`getBook:${id}`)
    this.requireSession()
    return this.requireBook(id)
  }

  async updateBook(id: number, patch: BookPatch): Promise<Book> {
    this.calls.push(`updateBook:${id}`)
    const caller = this.requireSession()

    // `require_admin` is a dependency, so it runs before the handler ever
    // looks the book up: a reader who is not an admin gets 403 even for an id
    // that does not exist. Same order as `updateUser` above, same reason.
    if (!caller.is_admin) throw new ApiError(403, 'Admin only')

    const book = this.requireBook(id)
    // Present keys only, and `null` means "clear it" — `exclude_unset=True` on
    // the other side. Title and author are not nullable on the server, which
    // is why the form guards them rather than sending an empty string.
    if (patch.title !== undefined) book.title = patch.title
    if (patch.author !== undefined) book.author = patch.author
    if ('year' in patch) book.year = patch.year ?? null
    if ('pages' in patch) book.pages = patch.pages ?? null
    if ('blurb' in patch) book.blurb = patch.blurb ?? null
    return book
  }

  async setBookState(id: number, state: BookStateWrite): Promise<Book> {
    this.calls.push(`setBookState:${id}`)
    const caller = this.requireSession()
    const book = this.requireBook(id)

    // Tags first, then the state row — the server's order, and it matters:
    // a rejected tag has to leave the rating exactly as it was.
    if (state.tag_ids !== undefined) {
      for (const tagId of state.tag_ids) {
        const tag = this.requireVisibleTag(tagId, caller)
        if (tag.is_global) {
          throw new ApiError(403, 'Global tags are managed by an admin, not per book')
        }
      }
      // Personal tags are replaced wholesale; the book's global tags stay.
      const globals = book.tag_ids.filter(
        (tagId) => this.tags.find((tag) => tag.id === tagId)?.is_global
      )
      book.tag_ids = [...globals, ...state.tag_ids]
    }

    if ('shelf_id' in state) {
      if (state.shelf_id === null) {
        book.shelf_id = null
      } else if (state.shelf_id !== undefined) {
        const shelf = this.requireVisibleShelf(state.shelf_id, caller)
        // Visible is not the same as yours. Somebody else's public shelf can
        // be read and filtered by, and is still a 403 to put a book on.
        if (shelf.owner_id !== caller.id) {
          throw new ApiError(403, 'You can only place books on your own shelves')
        }
        book.shelf_id = shelf.id
      }
    }

    // A PUT: both are written every time, even when the caller only meant to
    // change one. That is the trap this fake exists to keep honest — a fake
    // that patched instead would let a call site drop `progress` and pass.
    book.rating = state.rating
    book.progress = state.progress
    return book
  }

  async sendToKindle(id: number): Promise<KindleDelivery> {
    this.calls.push(`sendToKindle:${id}`)
    const caller = this.requireSession()

    // Checked before the book is even looked up, exactly as the endpoint does
    // it: an instance with no mail configured cannot send anything to anyone.
    if (this.kindleSender === null) {
      throw new ApiError(503, 'Kindle delivery is not configured on this server')
    }

    const book = this.requireBook(id)
    if (!caller.kindle_email) {
      throw new ApiError(422, 'Set your Kindle address before sending')
    }
    if (this.kindleFailure !== null) throw new ApiError(502, this.kindleFailure)

    const attempted_at = new Date().toISOString()
    // The server records the attempt on the reader's state row, so the next
    // read of the book carries it back as `last_sent_at`.
    book.last_sent_at = attempted_at
    return { book_id: id, sent_to: caller.kindle_email, attempted_at }
  }

  async listNotes(bookId: number): Promise<Note[]> {
    this.calls.push(`listNotes:${bookId}`)
    const caller = this.requireSession()
    this.requireBook(bookId)
    // Newest first, as the endpoint orders them.
    return this.notes
      .filter((note) => note.book_id === bookId && note.user_id === caller.id)
      .map(publicNote)
      .reverse()
  }

  async createNote(bookId: number, draft: NoteDraft): Promise<Note> {
    this.calls.push(`createNote:${bookId}`)
    const caller = this.requireSession()
    this.requireBook(bookId)
    if (!draft.text.trim()) throw new ApiError(422, 'A note needs some text')

    const note = fakeNote({
      user_id: caller.id,
      book_id: bookId,
      text: draft.text,
      page: draft.page ?? null,
      created_at: new Date().toISOString(),
    })
    this.notes.push(note)
    return publicNote(note)
  }

  async deleteNote(noteId: number): Promise<void> {
    this.calls.push(`deleteNote:${noteId}`)
    const caller = this.requireSession()
    const index = this.notes.findIndex((note) => note.id === noteId && note.user_id === caller.id)
    // Another reader's note is a 404, never a 403. A "forbidden" would confirm
    // the note exists, and what somebody wrote in the margin stays private —
    // from an admin too.
    if (index === -1) throw new ApiError(404, 'Note not found')
    this.notes.splice(index, 1)
  }

  private requireBook(id: number): FakeBook {
    const book = this.books.find((b) => b.id === id)
    if (!book) throw new ApiError(404, 'Book not found')
    return book
  }

  /** Mirrors `visible_tag`: 404, not an empty result, for a tag the caller cannot see. */
  private requireVisibleTag(tagId: number, caller: FakeUser): Tag {
    const tag = this.tags.find((t) => t.id === tagId)
    if (!tag || (tag.owner_id !== null && tag.owner_id !== caller.id)) {
      throw new ApiError(404, 'Tag not found')
    }
    return tag
  }

  /** Mirrors `_visible_shelf`: 404, not an empty result, for a shelf the caller cannot see. */
  private requireVisibleShelf(shelfId: number, caller: FakeUser): Shelf {
    const shelf = this.shelves.find((s) => s.id === shelfId)
    if (!shelf || (shelf.owner_id !== caller.id && shelf.visibility !== 'public')) {
      throw new ApiError(404, 'Shelf not found')
    }
    return shelf
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

/** Drops `user_id`, which `NoteRead` does not carry — every note read is the caller's own. */
function publicNote(note: FakeNote): Note {
  const { user_id: _userId, ...rest } = note
  return rest
}
