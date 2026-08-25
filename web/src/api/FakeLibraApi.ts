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
  TagCreate,
  TagPatch,
  User,
  UserPatch,
} from './types'

/** A user in the fake, plus the password only the fake knows. */
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

/** `BookRead` flattens shelf, tag and rating into one object, so the fake keeps one object too. */
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
  /** Whose note it is. */
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
    book_count: 0,
    editable: false,
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
    book_count: 0,
    editable: true,
    ...overrides,
  }
}

interface FakeOptions {
  users?: FakeUser[]
  /** Who is already signed in when the test starts. */
  signedInAs?: FakeUser | null
  /** The instance's send-from address, as `/auth/me` reports it. */
  kindleSender?: string | null
  books?: FakeBook[]
  tags?: Tag[]
  shelves?: Shelf[]
  notes?: FakeNote[]
  /** What the mail server does with the next send. */
  kindleFailure?: string | null
}

/** The in-memory server. It enforces the real one's rules, including the surprising ones. */
export class FakeLibraApi implements LibraApi {
  private handler: (() => void) | null = null

  readonly users: FakeUser[]
  readonly kindleSender: string | null
  /** Which user the session cookie belongs to. */
  signedInId: number | null
  readonly books: FakeBook[]
  readonly tags: Tag[]
  readonly shelves: Shelf[]
  readonly notes: FakeNote[]
  /** Settable mid-test, so one send can fail and the next succeed. */
  kindleFailure: string | null

  /** Every call this fake has answered, in order. */
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

  /** One message for a wrong name and a wrong password, as the server does it. */
  async login(username: string, password: string): Promise<User> {
    this.calls.push('login')
    const user = this.users.find((u) => u.username === username && u.password === password)
    if (!user) {
      this.refuse401('Invalid username or password')
    }
    this.signedInId = user.id
    return publicUser(user)
  }

  /** Signing out twice is a 401: the endpoint depends on `current_user`. */
  async logout(): Promise<void> {
    this.calls.push('logout')
    this.requireSession()
    this.signedInId = null
  }

  async me(): Promise<CurrentUser> {
    this.calls.push('me')
    const user = this.requireSession()
    return { ...publicUser(user), kindle_sender: this.kindleSender }
  }

  /**
   * Ownership is checked before existence, which is the server's order: a reader who is not an
   * admin gets 403 even for an id that does not exist, so the endpoint cannot be used to find
   * out which accounts are real.
   */
  async updateUser(id: number, patch: UserPatch): Promise<User> {
    this.calls.push(`updateUser:${id}`)
    const caller = this.requireSession()

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

    const items =
      params.sort === 'added'
        ? matches
        : [...matches].sort((a, b) => a.title.localeCompare(b.title))

    return { items, total: items.length }
  }

  async listTags(): Promise<Tag[]> {
    this.calls.push('listTags')
    const caller = this.requireSession()
    const visible = this.tags.filter((tag) => tag.owner_id === null || tag.owner_id === caller.id)
    return [
      ...visible.filter((tag) => tag.owner_id === null),
      ...visible.filter((tag) => tag.owner_id !== null),
    ].map((tag) => this.tagFor(tag, caller))
  }

  /**
   * Whether the caller may mint shared vocabulary is checked before the name is looked at, as
   * `create_tag` does: the refusal does not depend on what they wanted to call it.
   */
  async createTag(tag: TagCreate, makeGlobal = false): Promise<Tag> {
    this.calls.push(makeGlobal ? 'createTag:global' : 'createTag')
    const caller = this.requireSession()

    if (makeGlobal && !caller.is_admin) {
      throw new ApiError(403, 'Only an admin can manage global tags')
    }

    const name = this.cleanTagName(tag.name)
    this.requireTagNameFree(name, caller, undefined, makeGlobal)

    const created: Tag = {
      id: nextTagId++,
      name,
      owner_id: makeGlobal ? null : caller.id,
      is_global: makeGlobal,
      book_count: 0,
      editable: true,
    }
    this.tags.push(created)
    return this.tagFor(created, caller)
  }

  async updateTag(id: number, patch: TagPatch): Promise<Tag> {
    this.calls.push(`updateTag:${id}`)
    const caller = this.requireSession()
    const tag = this.requireEditableTag(id, caller)

    const name = this.cleanTagName(patch.name)
    this.requireTagNameFree(name, caller, tag.id)
    tag.name = name
    return this.tagFor(tag, caller)
  }

  /** Clears the link rows too, so no book keeps an id pointing at a tag that is gone. */
  async deleteTag(id: number): Promise<void> {
    this.calls.push(`deleteTag:${id}`)
    const caller = this.requireSession()
    const tag = this.requireEditableTag(id, caller)

    for (const book of this.books) {
      book.tag_ids = book.tag_ids.filter((tagId) => tagId !== tag.id)
    }
    this.tags.splice(this.tags.indexOf(tag), 1)
  }

  /**
   * The caller's own first, in this array's order, then other readers' public ones — what
   * `library.list_shelves` returns, and what the shelves screen trusts rather than re-sorting.
   */
  async listShelves(): Promise<Shelf[]> {
    this.calls.push('listShelves')
    const caller = this.requireSession()
    const visible = this.shelves.filter(
      (shelf) => shelf.owner_id === caller.id || shelf.visibility === 'public'
    )
    return [
      ...visible.filter((shelf) => shelf.owner_id === caller.id),
      ...visible.filter((shelf) => shelf.owner_id !== caller.id),
    ].map((shelf) => this.withEditable(shelf, caller))
  }

  /** Appended: a new shelf lands at the end of the caller's order, not the top. */
  async createShelf(shelf: ShelfCreate): Promise<Shelf> {
    this.calls.push('createShelf')
    const caller = this.requireSession()

    const name = shelf.name.trim()
    if (!name) throw new ApiError(422, 'Shelf name must not be empty')
    this.requireNameFree(name, caller)

    const created: Shelf = {
      id: nextShelfId++,
      owner_id: caller.id,
      owner_username: caller.username,
      name,
      visibility: shelf.visibility ?? 'private',
      book_count: 0,
      editable: true,
    }
    this.shelves.push(created)
    return created
  }

  async updateShelf(id: number, patch: ShelfPatch): Promise<Shelf> {
    this.calls.push(`updateShelf:${id}`)
    const caller = this.requireSession()
    const shelf = this.requireOwnedShelf(id, caller)

    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new ApiError(422, 'Shelf name must not be empty')
      this.requireNameFree(name, caller, shelf.id)
      shelf.name = name
    }
    if (patch.visibility !== undefined) shelf.visibility = patch.visibility

    return shelf
  }

  /** The books stay in the library and become unshelved, which is a valid state. */
  async deleteShelf(id: number): Promise<void> {
    this.calls.push(`deleteShelf:${id}`)
    const caller = this.requireSession()
    const shelf = this.requireOwnedShelf(id, caller)

    for (const book of this.books) {
      if (book.shelf_id === shelf.id) book.shelf_id = null
    }
    this.shelves.splice(this.shelves.indexOf(shelf), 1)
  }

  /** The list must be exactly the caller's own shelves, each once. */
  async reorderShelves(shelfIds: number[]): Promise<Shelf[]> {
    this.calls.push('reorderShelves')
    const caller = this.requireSession()

    const mine = this.shelves.filter((shelf) => shelf.owner_id === caller.id)
    const wanted = [...shelfIds].sort((a, b) => a - b)
    const owned = mine.map((shelf) => shelf.id).sort((a, b) => a - b)
    if (wanted.length !== owned.length || wanted.some((id, i) => id !== owned[i])) {
      throw new ApiError(422, 'The list must contain exactly your own shelves, each once')
    }

    const byId = new Map(mine.map((shelf) => [shelf.id, shelf]))
    const reordered = shelfIds.map((id) => byId.get(id)).filter((shelf) => shelf !== undefined)
    const others = this.shelves.filter((shelf) => shelf.owner_id !== caller.id)
    this.shelves.splice(0, this.shelves.length, ...reordered, ...others)
    return this.listShelves()
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

  /**
   * Admin-only, and refused before the book is looked up — `require_admin` is a dependency on
   * the server, so a reader gets 403 even for an id that does not exist.
   */
  async updateBook(id: number, patch: BookPatch): Promise<Book> {
    this.calls.push(`updateBook:${id}`)
    const caller = this.requireSession()

    if (!caller.is_admin) throw new ApiError(403, 'Admin only')

    const book = this.requireBook(id)
    if (patch.title !== undefined) book.title = patch.title
    if (patch.author !== undefined) book.author = patch.author
    if ('year' in patch) book.year = patch.year ?? null
    if ('pages' in patch) book.pages = patch.pages ?? null
    if ('blurb' in patch) book.blurb = patch.blurb ?? null
    return book
  }

  /**
   * Tags are written before the state row, the server's order, so a rejected tag leaves the
   * rating exactly as it was.
   */
  async setBookState(id: number, state: BookStateWrite): Promise<Book> {
    this.calls.push(`setBookState:${id}`)
    const caller = this.requireSession()
    const book = this.requireBook(id)

    if (state.tag_ids !== undefined) {
      for (const tagId of state.tag_ids) {
        const tag = this.requireVisibleTag(tagId, caller)
        if (tag.is_global && !caller.is_admin) {
          throw new ApiError(403, 'Only an admin can put a global tag on a book')
        }
      }
      const kept = caller.is_admin
        ? []
        : book.tag_ids.filter((tagId) => this.tags.find((tag) => tag.id === tagId)?.is_global)
      book.tag_ids = [...new Set([...kept, ...state.tag_ids])]
    }

    if ('shelf_id' in state) {
      if (state.shelf_id === null) {
        book.shelf_id = null
      } else if (state.shelf_id !== undefined) {
        const shelf = this.requireVisibleShelf(state.shelf_id, caller)
        if (shelf.owner_id !== caller.id) {
          throw new ApiError(403, 'You can only place books on your own shelves')
        }
        book.shelf_id = shelf.id
      }
    }

    book.rating = state.rating
    book.progress = state.progress
    return book
  }

  /**
   * A missing mail configuration is refused before the book is looked up, as the endpoint does
   * it: an instance with no mail cannot send to anyone.
   */
  async sendToKindle(id: number): Promise<KindleDelivery> {
    this.calls.push(`sendToKindle:${id}`)
    const caller = this.requireSession()

    if (this.kindleSender === null) {
      throw new ApiError(503, 'Kindle delivery is not configured on this server')
    }

    const book = this.requireBook(id)
    if (!caller.kindle_email) {
      throw new ApiError(422, 'Set your Kindle address before sending')
    }
    if (this.kindleFailure !== null) throw new ApiError(502, this.kindleFailure)

    const attempted_at = new Date().toISOString()
    book.last_sent_at = attempted_at
    return { book_id: id, sent_to: caller.kindle_email, attempted_at }
  }

  /** Newest first, as the endpoint orders them. */
  async listNotes(bookId: number): Promise<Note[]> {
    this.calls.push(`listNotes:${bookId}`)
    const caller = this.requireSession()
    this.requireBook(bookId)
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

  /**
   * Another reader's note is a 404, never a 403: "forbidden" would confirm it exists, and what
   * somebody wrote in the margin stays private from an admin too.
   */
  async deleteNote(noteId: number): Promise<void> {
    this.calls.push(`deleteNote:${noteId}`)
    const caller = this.requireSession()
    const index = this.notes.findIndex((note) => note.id === noteId && note.user_id === caller.id)
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

  /**
   * Mirrors `owned_shelf`, and the two-step answer matters: a shelf the caller cannot see at
   * all is a 404, so ids cannot be walked to find other people's private shelves, while one
   * they *can* see and do not own is an honest 403.
   */
  private requireOwnedShelf(shelfId: number, caller: FakeUser): Shelf {
    const shelf = this.requireVisibleShelf(shelfId, caller)
    if (shelf.owner_id !== caller.id) {
      throw new ApiError(403, 'This shelf belongs to someone else')
    }
    return shelf
  }

  /** Mirrors `_assert_name_free`. */
  /** Mirrors `library.clean_tag_name`. */
  private cleanTagName(raw: string): string {
    const name = raw.trim()
    if (!name) throw new ApiError(422, 'Tag name must not be empty')
    if (/\s/.test(name)) {
      throw new ApiError(422, "Tag names cannot contain spaces. Use a hyphen, like 'lent-out'.")
    }
    return name
  }

  /**
   * Mirrors `_assert_tag_name_free`, including the rule a schema alone would not give: a
   * personal tag may not shadow a global one, because two rows reading the same in one sidebar
   * is a bug from the reader's side.
   */
  private requireTagNameFree(
    name: string,
    caller: FakeUser,
    exceptId?: number,
    isGlobal = false
  ): void {
    const clashesWithGlobal = this.tags.some(
      (tag) =>
        tag.owner_id === null &&
        tag.id !== exceptId &&
        tag.name.toLowerCase() === name.toLowerCase()
    )
    if (clashesWithGlobal) throw new ApiError(409, 'A global tag already uses that name')
    if (isGlobal) return

    const taken = this.tags.some(
      (tag) =>
        tag.owner_id === caller.id &&
        tag.id !== exceptId &&
        tag.name.toLowerCase() === name.toLowerCase()
    )
    if (taken) throw new ApiError(409, 'You already have a tag with that name')
  }

  /**
   * A tag the caller cannot see is a 404 and a global one they may not touch is a 403 — the
   * same two-step answer the shelf endpoints give, and for the same reason: ids must not be
   * walkable to find other people's private tags.
   */
  private requireEditableTag(tagId: number, caller: FakeUser): Tag {
    const tag = this.requireVisibleTag(tagId, caller)
    if (tag.owner_id === null && !caller.is_admin) {
      throw new ApiError(403, 'Only an admin can manage global tags')
    }
    return tag
  }

  /**
   * `editable` and `book_count` are answers the server works out per request, not stored
   * columns.
   */
  private tagFor(tag: Tag, caller: FakeUser): Tag {
    return {
      ...tag,
      editable: tag.owner_id === null ? caller.is_admin : tag.owner_id === caller.id,
      book_count: this.books.filter((book) => book.tag_ids.includes(tag.id)).length,
    }
  }

  private requireNameFree(name: string, caller: FakeUser, exceptId?: number): void {
    const taken = this.shelves.some(
      (shelf) =>
        shelf.owner_id === caller.id &&
        shelf.id !== exceptId &&
        shelf.name.toLowerCase() === name.toLowerCase()
    )
    if (taken) throw new ApiError(409, 'You already have a shelf with that name')
  }

  /** `editable` is the server's answer to "may this caller change it", not a stored column. */
  private withEditable(shelf: Shelf, caller: FakeUser): Shelf {
    return { ...shelf, editable: shelf.owner_id === caller.id }
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
