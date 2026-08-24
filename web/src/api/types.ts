/**
 * The shapes the server sends and accepts.
 *
 * Hand-written, and only the ones this milestone needs. They mirror the
 * SQLModel classes in `backend/app/models.py` — `UserRead`, `CurrentUserRead`,
 * `LoginRequest`, `UserUpdate` — and each one is named after the class it
 * mirrors so the pair is easy to find.
 *
 * Extra fields the server adds later are ignored rather than rejected. That is
 * a deliberate rule from docs/specs/phase-4-plan.md: format conversion will add
 * fields to the book model, and a client that only reads what it names keeps
 * working when that happens.
 */

/** A user as anyone may see them. Never carries the password hash. */
export interface User {
  id: number
  username: string
  is_admin: boolean
  kindle_email: string | null
  created_at: string
}

/**
 * The signed-in user, from `GET /api/auth/me`.
 *
 * `kindle_sender` is the address the instance sends from. It is instance
 * config rather than a property of the user, which is why it is only here and
 * never on the `/api/users` list. Null when the instance has no mail set up.
 */
export interface CurrentUser extends User {
  kindle_sender: string | null
}

/**
 * A change to a user, for `PATCH /api/users/{id}`.
 *
 * Every field is optional and the server only touches the ones that are
 * present — it reads the body with `exclude_unset=True`. So leaving a key out
 * means "do not change it", while sending `null` means "clear it". The two are
 * different, and getting them the wrong way round is how a Kindle address
 * would be wiped by a form that never asked about it.
 */
export interface UserPatch {
  password?: string
  kindle_email?: string | null
  is_admin?: boolean
}

/**
 * A book as one reader sees it, from `GET /api/books` and `GET /api/books/{id}`.
 *
 * `BookRead` on the server carries more fields than this — `file_path`,
 * `book_metadata`, `started_at` and `finished_at`. Only what a screen actually
 * reads is named here; the rest is ignored rather than rejected, same as every
 * other type in this file.
 *
 * **Shared catalog and personal state sit side by side in this one object**,
 * and they are not written the same way. `title` down to `blurb` describe the
 * edition and change what every reader sees, so only an admin may write them,
 * through `PATCH /api/books/{id}`. `shelf_id`, `rating`, `progress` and
 * `last_sent_at` are this reader's own and nobody else's, and go through
 * `PUT /api/books/{id}/state`. The server flattens the two together because a
 * screen shows them together; the split still decides which call to make.
 */
export interface Book {
  id: number
  title: string
  author: string
  /** `epub` today. Drawn upper-case in the detail screen's metadata line. */
  format: string
  /** Null when the file never declared one. Never invented — blank is honest. */
  year: number | null
  /** The description. Null when nothing supplied one. */
  blurb: string | null
  /** Page count. Null for a book whose file did not say, which is most of them. */
  pages: number | null
  /** Whether `GET /books/{id}/cover` will answer with an image. False draws the gradient fallback. */
  has_cover: boolean
  tag_ids: number[]
  /** The shelf this reader put it on, or null for none. At most one, by the server's design. */
  shelf_id: number | null
  /** 0 when unrated. */
  rating: number
  /** 0 to 1. The status line reads this: 0 is "Not started", 1 is a star rating, otherwise a progress bar. */
  progress: number
  /** When this reader last emailed it to their Kindle. Null when never. ISO 8601. */
  last_sent_at: string | null
}

/**
 * A change to the shared catalog, for `PATCH /api/books/{id}`. Admin only.
 *
 * Same rule as `UserPatch`: the server reads the body with `exclude_unset`, so
 * a key that is absent means "leave it alone" and an explicit `null` means
 * "clear it". `file_path` is deliberately absent from the server's own model —
 * where a book is stored belongs to the storage layer, not to whoever is
 * correcting a typo in the title.
 */
export interface BookPatch {
  title?: string
  author?: string
  year?: number | null
  pages?: number | null
  blurb?: string | null
}

/**
 * The reader's own state, for `PUT /api/books/{id}/state`.
 *
 * **`rating` and `progress` are required, and that is the whole point of this
 * type.** The endpoint is a PUT: it writes the state row as a whole, so a body
 * that leaves `rating` out does not keep the old rating, it sets it to zero.
 * Making both required means no call site can silently wipe one while setting
 * the other — the trap is listed in docs/specs/client-stack.md as one to carry
 * over from the Flutter client, and this is how it is carried over.
 *
 * `shelf_id` behaves the other way round, because the server reads it with
 * `exclude_unset`: leaving it out keeps the book where it is, and an explicit
 * `null` takes it off its shelf.
 */
export interface BookStateWrite {
  rating: number
  progress: number
  shelf_id?: number | null
  /** Replaces this reader's personal tags on the book. Global tags are unaffected. */
  tag_ids?: number[]
}

/** One note or highlight, from `GET /api/books/{id}/notes`. Always the caller's own. */
export interface Note {
  id: number
  book_id: number
  text: string
  /** Optional: a reflowable EPUB has no pages to cite. */
  page: number | null
  created_at: string
}

/** The writable half of a note, for `POST /api/books/{id}/notes`. */
export interface NoteDraft {
  text: string
  page?: number | null
}

/**
 * What `POST /api/books/{id}/send-to-kindle` reports back.
 *
 * `attempted_at`, not `sent_at`, and the server answers `202` rather than
 * `200`. Amazon throws away mail from a sender the reader has not approved and
 * sends no bounce, so handing the message to the mail server is the last thing
 * libra can honestly claim to know.
 */
export interface KindleDelivery {
  book_id: number
  sent_to: string
  attempted_at: string
}

/** `GET /api/books`. An envelope rather than a bare array — see `BookList` on the server for why. */
export interface BookList {
  items: Book[]
  total: number
}

export type BookSort = 'title' | 'added'

/**
 * `GET /api/books`'s query parameters, already merged into one filter set.
 *
 * Merging sidebar and typed `#tag` selections into `tagIds` is the caller's
 * job — `client-design.md` is explicit that this endpoint's OR/AND semantics
 * are not the client's to reimplement, only to invoke correctly.
 */
export interface BookSearchParams {
  q?: string
  tagIds?: number[]
  shelfId?: number
  sort?: BookSort
}

/** A label on a book, from `GET /api/tags`. Global (`owner_id: null`) or personal. */
export interface Tag {
  id: number
  name: string
  owner_id: number | null
  is_global: boolean
}

/**
 * `GET /api/shelves`. Carries every shelf the caller may see: their own, in
 * the order they arranged them, then other readers' public ones.
 *
 * **That order is the server's and is never re-sorted here.** It is the one
 * thing about the shelves screen the reader controls, and sorting a list
 * client-side is how it would quietly be thrown away.
 */
export interface Shelf {
  id: number
  owner_id: number
  /**
   * Whose shelf this is, by name. Only useful for somebody else's public
   * shelf, which is labelled "by {username}" — and only available here,
   * because listing users is admin-only and a reader still has to be able to
   * tell one shared shelf from another.
   */
  owner_username: string
  name: string
  /** `public` means every reader can see it. None of them can change it. */
  visibility: ShelfVisibility
  /** How many books are on it, as this caller sees it. */
  book_count: number
  /** True when the caller may modify it, which is also how "mine" is told from "shared". */
  editable: boolean
}

export type ShelfVisibility = 'private' | 'public'

/** The body of `POST /api/shelves`. A new shelf is private unless it says otherwise. */
export interface ShelfCreate {
  name: string
  visibility?: ShelfVisibility
}

/**
 * A change to a shelf, for `PATCH /api/shelves/{id}`. Owner only.
 *
 * Same `exclude_unset` rule as everywhere else: an absent key means "leave it
 * alone". `position` is deliberately not here — reordering goes through
 * `PUT /api/shelves/order` as one complete list, so it is a single decision
 * rather than a race between rows.
 */
export interface ShelfPatch {
  name?: string
  visibility?: ShelfVisibility
}
