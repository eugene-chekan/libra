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
 * `book_metadata`, `started_at`/`finished_at`/`last_sent_at` and so on. Only
 * what this milestone's grid card actually reads is named here; the rest is
 * ignored rather than rejected, same as every other type in this file.
 */
export interface Book {
  id: number
  title: string
  author: string
  /** Whether `GET /books/{id}/cover` will answer with an image. False draws the gradient fallback. */
  has_cover: boolean
  tag_ids: number[]
  /** 0 when unrated. Read-only here — rating is set from the book detail screen, not this milestone. */
  rating: number
  /** 0 to 1. The status line reads this: 0 is "Not started", 1 is a star rating, otherwise a progress bar. */
  progress: number
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
 * `GET /api/shelves`. Carries every shelf the caller may see: their own plus
 * other readers' public ones — this milestone's sidebar only shows the
 * caller's own (`editable`), leaving the rest for #28's "Shared with you".
 */
export interface Shelf {
  id: number
  owner_id: number
  owner_username: string
  name: string
  visibility: 'private' | 'public'
  /** True when the caller may modify it, which is also how the sidebar tells "mine" from "shared". */
  editable: boolean
}
