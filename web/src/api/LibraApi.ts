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

/** Everything the client can ask the server for. */
export interface LibraApi {
  /** Registers the one handler that runs on every 401 the server returns. */
  setOnUnauthorized(handler: (() => void) | null): void

  /** `POST /api/auth/login`. */
  login(username: string, password: string): Promise<User>

  /** `POST /api/auth/logout`. */
  logout(): Promise<void>

  /** `GET /api/auth/me`. */
  me(): Promise<CurrentUser>

  /** `PATCH /api/users/{id}`. */
  updateUser(id: number, patch: UserPatch): Promise<User>

  /** `GET /api/users`. Admin only. */
  listUsers(): Promise<User[]>

  /** `POST /api/users`. Admin only. */
  createUser(user: UserCreate): Promise<User>

  /** `DELETE /api/users/{id}`. Admin only; refuses the caller's own id. */
  deleteUser(id: number): Promise<void>

  /** `GET /api/books`. */
  listBooks(params?: BookSearchParams): Promise<BookList>

  /** `POST /api/books/upload` — creates a book from an EPUB, deriving metadata from the file. */
  uploadBook(file: File): Promise<Book>

  /** `GET /api/tags`. */
  listTags(): Promise<Tag[]>

  /** `POST /api/tags`. */
  createTag(tag: TagCreate, makeGlobal?: boolean): Promise<Tag>

  /** `PATCH /api/tags/{id}`. */
  updateTag(id: number, patch: TagPatch): Promise<Tag>

  /** `DELETE /api/tags/{id}`. */
  deleteTag(id: number): Promise<void>

  /** `GET /api/shelves`. */
  listShelves(): Promise<Shelf[]>

  /** `POST /api/shelves`. */
  createShelf(shelf: ShelfCreate): Promise<Shelf>

  /** `PATCH /api/shelves/{id}`. */
  updateShelf(id: number, patch: ShelfPatch): Promise<Shelf>

  /** `DELETE /api/shelves/{id}`. */
  deleteShelf(id: number): Promise<void>

  /** `PUT /api/shelves/order`. */
  reorderShelves(shelfIds: number[]): Promise<Shelf[]>

  /**
   * `GET /api/books/{id}/cover`, as a URL rather than a fetch — the caller hands this straight
   * to an `<img src>`.
   */
  coverUrl(id: number): string

  /** `GET /api/books/{id}`. */
  getBook(id: number): Promise<Book>

  /** `PATCH /api/books/{id}`. */
  updateBook(id: number, patch: BookPatch): Promise<Book>

  /** `PUT /api/books/{id}/state`. */
  setBookState(id: number, state: BookStateWrite): Promise<Book>

  /** `POST /api/books/{id}/send-to-kindle`. */
  sendToKindle(id: number): Promise<KindleDelivery>

  /** `GET /api/books/{id}/notes`. */
  listNotes(bookId: number): Promise<Note[]>

  /** `POST /api/books/{id}/notes`. */
  createNote(bookId: number, note: NoteDraft): Promise<Note>

  /** `DELETE /api/notes/{id}`. */
  deleteNote(noteId: number): Promise<void>

  /**
   * `GET /api/books/{id}/file`, as a URL rather than a fetch, for the same reason as {@link
   * coverUrl}: the caller hands it to the browser — here an `<a download>` — and lets it do the
   * transfer.
   */
  fileUrl(id: number): string
}
