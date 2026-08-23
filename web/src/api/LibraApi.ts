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
 * Everything the client can ask the server for.
 *
 * This interface is the seam. `HttpLibraApi` talks to a real server;
 * `FakeLibraApi` answers from memory. Screens are handed one of them and
 * cannot tell which, so the whole component suite runs with no backend and no
 * network, and the end-to-end suite runs against the real thing.
 *
 * One method per endpoint, named after it, with the same arguments the
 * endpoint takes. It is deliberately a thin mirror rather than a convenience
 * layer: a method that quietly makes two requests hides the API from the code
 * that reads it, and this milestone exists to check that the API is right.
 *
 * Later milestones add shelves and tags management here.
 */
export interface LibraApi {
  /**
   * Registers the one handler that runs on every 401 the server returns.
   * `null` clears it. A second call replaces the first — there is exactly one
   * listener, because there is exactly one thing in the app that needs to
   * know: `SessionProvider`.
   *
   * A method rather than a public field the caller assigns directly, so that
   * registering it is a call, not a mutation of an object a hook handed back —
   * `SessionProvider` holds the one `LibraApi` instance for the app's
   * lifetime via `useApi()`, and writing straight to a property on that
   * object is exactly the pattern `eslint-plugin-react-hooks`'s immutability
   * rule exists to catch.
   *
   * It lives on the interface, not only on the HTTP client, because the fake
   * has to behave the same way — a fake that never reports an expired session
   * would make the expiry tests pass without testing anything.
   *
   * Every 401 fires it, including a wrong password on the login screen. Deciding
   * which of those actually ends a session is one rule and lives in one place,
   * `SessionProvider`, which is the only thing that knows whether a session was
   * live in the first place.
   */
  setOnUnauthorized(handler: (() => void) | null): void

  /** `POST /api/auth/login`. Sets the session cookie. 401 on bad credentials. */
  login(username: string, password: string): Promise<User>

  /** `POST /api/auth/logout`. Revokes the session on the server, not only in the browser. */
  logout(): Promise<void>

  /** `GET /api/auth/me`. 401 when there is no session — this is also the cold-load probe. */
  me(): Promise<CurrentUser>

  /** `PATCH /api/users/{id}`. Only the fields present in `patch` change. */
  updateUser(id: number, patch: UserPatch): Promise<User>

  /**
   * `GET /api/books`. Filter semantics are the server's, not the client's —
   * `tagIds` OR each other, `shelfId` ANDs against that, `q` ANDs again as a
   * case-insensitive substring match on title or author. A `tagIds` or
   * `shelfId` the caller cannot see is a 404, never an empty list, so that
   * filtering by an id someone else owns cannot be used to probe whether it
   * exists.
   */
  listBooks(params?: BookSearchParams): Promise<BookList>

  /** `GET /api/tags`. The caller's visible vocabulary: global tags, then their own. */
  listTags(): Promise<Tag[]>

  /** `GET /api/shelves`. The caller's own shelves, then other readers' public ones. */
  listShelves(): Promise<Shelf[]>

  /**
   * `GET /api/books/{id}/cover`, as a URL rather than a fetch — the caller
   * hands this straight to an `<img src>`. Not a network call itself, so
   * `FakeLibraApi` returns the same shape without needing to fake image
   * bytes; the fallback for a book with no cover is what `has_cover` on
   * `Book` is for.
   */
  coverUrl(id: number): string

  /** `GET /api/books/{id}`. 404 for a book that is not in this library. */
  getBook(id: number): Promise<Book>

  /**
   * `PATCH /api/books/{id}`. The shared catalog, so **admin only** — a reader
   * without the flag gets a 403. Only the fields present in `patch` change.
   */
  updateBook(id: number, patch: BookPatch): Promise<Book>

  /**
   * `PUT /api/books/{id}/state`. The caller's own rating, progress, shelf and
   * personal tags. Always permitted: it touches nobody else's view.
   *
   * A PUT, so `state` is the whole row — see {@link BookStateWrite} for why
   * `rating` and `progress` are required rather than optional.
   */
  setBookState(id: number, state: BookStateWrite): Promise<Book>

  /**
   * `POST /api/books/{id}/send-to-kindle`. No body: the destination is the
   * caller's own stored address and cannot be given per request.
   *
   * Fails in four different ways, and the button shows a different sentence
   * for each: 422 when the reader has set no address, 413 when the book is
   * over Amazon's attachment limit, 503 when this instance has no mail
   * configured, 502 when the mail server refused it.
   */
  sendToKindle(id: number): Promise<KindleDelivery>

  /** `GET /api/books/{id}/notes`. The caller's own notes, newest first. */
  listNotes(bookId: number): Promise<Note[]>

  /** `POST /api/books/{id}/notes`. */
  createNote(bookId: number, note: NoteDraft): Promise<Note>

  /** `DELETE /api/notes/{id}`. Another reader's note is a 404, never a 403. */
  deleteNote(noteId: number): Promise<void>

  /**
   * `GET /api/books/{id}/file`, as a URL rather than a fetch, for the same
   * reason as {@link coverUrl}: the caller hands it to the browser — here an
   * `<a download>` — and lets it do the transfer. The offered filename is the
   * server's business, rebuilt from the catalog rather than echoed from
   * whatever the uploader called the file.
   */
  fileUrl(id: number): string
}
