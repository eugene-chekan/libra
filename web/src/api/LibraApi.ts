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
 * Later milestones add tag management here.
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

  /**
   * `POST /api/tags`. Creates a personal tag, or a global one with
   * `makeGlobal` — which is `?make_global=true` on the wire and admin-only:
   * an ordinary reader asking for one is a 403, since a global tag changes
   * what the whole household sees.
   *
   * 422 when the name is blank, and 422 when it contains a space — the search
   * box reads `#tag` tokens and splits on whitespace, so a two-word name
   * could be made and then never searched for. 409 when the caller already
   * has that name, or when a global tag has it: two identical rows in one
   * sidebar is a bug from the reader's side however the schema feels about it.
   */
  createTag(tag: TagCreate, makeGlobal?: boolean): Promise<Tag>

  /**
   * `PATCH /api/tags/{id}`. Renames it, and moves no books — they reference
   * the tag by id.
   *
   * A tag the caller cannot see is a 404, never a 403: "forbidden" would
   * confirm that somebody else's private tag exists. A global tag is a 403
   * for anyone but an admin. The name rules are `createTag`'s.
   */
  updateTag(id: number, patch: TagPatch): Promise<Tag>

  /**
   * `DELETE /api/tags/{id}`. Removes it from every book it was on, in one
   * transaction. The books themselves stay.
   *
   * Same visibility rules as `updateTag`: 404 for one the caller cannot see,
   * 403 for a global tag unless they are an admin.
   */
  deleteTag(id: number): Promise<void>

  /** `GET /api/shelves`. The caller's own shelves in their order, then other readers' public ones. */
  listShelves(): Promise<Shelf[]>

  /**
   * `POST /api/shelves`. Lands at the end of the caller's order.
   *
   * 409 when they already have a shelf with that name — the server compares
   * without case, so "To Read" and "to read" are the same name. 422 when the
   * name is blank.
   */
  createShelf(shelf: ShelfCreate): Promise<Shelf>

  /**
   * `PATCH /api/shelves/{id}`. Rename, or publish and unpublish. Owner only:
   * a shelf the caller cannot see is a 404, and one they can see but do not
   * own is a 403.
   *
   * A rename moves no books. They reference the shelf by id, which is the
   * whole reason shelves are rows rather than matched names.
   */
  updateShelf(id: number, patch: ShelfPatch): Promise<Shelf>

  /**
   * `DELETE /api/shelves/{id}`. The books on it stay in the library and
   * become unshelved.
   *
   * The endpoint also takes `reassign_to`, to move them onto another shelf in
   * the same transaction. This client does not use it: moving somebody's
   * books somewhere they did not choose is worse than leaving them loose.
   */
  deleteShelf(id: number): Promise<void>

  /**
   * `PUT /api/shelves/order`. The caller's complete shelf list, in the order
   * they want it.
   *
   * The whole list, not one moved row: it is atomic, it matches what the
   * manage dialog is doing, and it cannot produce the duplicate or gapped
   * positions that racing single-row updates would. Anything that is not
   * exactly the caller's own shelves, each once, is a 422.
   */
  reorderShelves(shelfIds: number[]): Promise<Shelf[]>

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
