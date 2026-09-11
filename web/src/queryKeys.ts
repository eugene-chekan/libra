import type { BookSearchParams } from './api/types'

/** Every TanStack Query cache key, so a query and the writes that refresh it name the same key. */
export const queryKeys = {
  /** Every book list, whatever its filter: refreshing this refreshes all of them. */
  books: ['books'] as const,
  /** One filtered book list. */
  bookList: (params: BookSearchParams) => ['books', params] as const,
  book: (id: number) => ['book', id] as const,
  notes: (bookId: number) => ['notes', bookId] as const,
  shelves: ['shelves'] as const,
  tags: ['tags'] as const,
  users: ['users'] as const,
  maintenance: ['maintenance'] as const,
  health: ['health'] as const,
}
