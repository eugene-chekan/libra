/** The shapes the server sends and accepts. */

/** A user as anyone may see them. */
export interface User {
  id: number
  username: string
  is_admin: boolean
  kindle_email: string | null
  created_at: string
}

/** The signed-in user, from `GET /api/auth/me`. */
export interface CurrentUser extends User {
  kindle_sender: string | null
}

/** A change to a user, for `PATCH /api/users/{id}`. */
export interface UserPatch {
  password?: string
  kindle_email?: string | null
  is_admin?: boolean
}

/** `POST /api/users`. */
export interface UserCreate {
  username: string
  password: string
  is_admin?: boolean
  kindle_email?: string | null
}

/** A book as one reader sees it, from `GET /api/books` and `GET /api/books/{id}`. */
export interface Book {
  id: number
  title: string
  author: string
  /** `epub` today. */
  format: string
  /** Null when the file never declared one. */
  year: number | null
  /** The description. */
  blurb: string | null
  /** Page count. */
  pages: number | null
  /** Whether `GET /books/{id}/cover` will answer with an image. */
  has_cover: boolean
  tag_ids: number[]
  /** The shelf this reader put it on, or null for none. */
  shelf_id: number | null
  /** 0 when unrated. */
  rating: number
  /** 0 to 1. */
  progress: number
  /**
   * Exactly where this reader stopped, in the reading client's own terms — for EPUB, an
   * epub.js CFI. `progress` says how far through the book that is; this says where. A
   * percentage cannot be turned back into a place, so both are kept. Null until first read,
   * and for anything read before positions were stored.
   */
  position: string | null
  /** When this reader last emailed it to their Kindle. */
  last_sent_at: string | null
}

/** A change to the shared catalog, for `PATCH /api/books/{id}`. */
export interface BookPatch {
  title?: string
  author?: string
  year?: number | null
  pages?: number | null
  blurb?: string | null
}

/** The reader's own state, for `PUT /api/books/{id}/state`. */
export interface BookStateWrite {
  /** Omit to leave the rating as it is. Send 0 to clear it. */
  rating?: number
  /** Omit to leave progress as it is. Send 0 to rewind the book. */
  progress?: number
  /** Omit to leave the reader's place as it is. */
  position?: string | null
  shelf_id?: number | null
  /** Replaces this reader's personal tags on the book. */
  tag_ids?: number[]
}

/** One note or highlight, from `GET /api/books/{id}/notes`. */
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

/** What `POST /api/books/{id}/send-to-kindle` reports back. */
export interface KindleDelivery {
  book_id: number
  sent_to: string
  attempted_at: string
}

/** `GET /api/books`. */
export interface BookList {
  items: Book[]
  total: number
}

export type BookSort = 'title' | 'added'

/** `GET /api/books`'s query parameters, already merged into one filter set. */
export interface BookSearchParams {
  q?: string
  tagIds?: number[]
  shelfId?: number
  sort?: BookSort
}

/** A label on a book, from `GET /api/tags`. */
export interface Tag {
  id: number
  name: string
  owner_id: number | null
  is_global: boolean
  /** How many books carry it. */
  book_count: number
  /**
   * True when the caller may rename or delete it: their own tag always, a global one only for
   * an admin.
   */
  editable: boolean
}

/** `POST /api/tags`. */
export interface TagCreate {
  name: string
}

/** A change to a tag, for `PATCH /api/tags/{id}`. */
export interface TagPatch {
  name: string
}

/** `GET /api/shelves`. */
export interface Shelf {
  id: number
  owner_id: number
  /** Whose shelf this is, by name. */
  owner_username: string
  name: string
  /** `public` means every reader can see it. */
  visibility: ShelfVisibility
  /** How many books are on it, as this caller sees it. */
  book_count: number
  /** True when the caller may modify it, which is also how "mine" is told from "shared". */
  editable: boolean
}

export type ShelfVisibility = 'private' | 'public'

/** The body of `POST /api/shelves`. */
export interface ShelfCreate {
  name: string
  visibility?: ShelfVisibility
}

/** A change to a shelf, for `PATCH /api/shelves/{id}`. */
export interface ShelfPatch {
  name?: string
  visibility?: ShelfVisibility
}

export type MessageRole = 'user' | 'librarian'

/** A book the librarian pointed to in a reply. */
export interface Citation {
  book_id: number
  title: string
}

/** One turn in a conversation with the librarian, from `GET /api/conversations/mine`. */
export interface LibrarianMessage {
  id: number
  role: MessageRole
  content: string
  created_at: string
  meta: { citation?: Citation; tool_call?: { summary: string } }
}

/** The reader's one implicit conversation with the librarian. */
export interface Conversation {
  id: number
  messages: LibrarianMessage[]
}
