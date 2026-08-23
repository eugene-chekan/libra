import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book, BookPatch, BookStateWrite, KindleDelivery } from '../api/types'

/**
 * The book detail screen's reads and writes.
 *
 * **Every write here invalidates the same three things**, through
 * {@link useBookRefresh}: the book itself, the library grid, and the shelf
 * list. That is not caution — a rating changes the grid's status line, a shelf
 * move changes which books the grid shows under a shelf filter, and both
 * change a shelf's book count in the sidebar. Leaving any of the three stale
 * shows the reader two different answers about the same book on two screens.
 */

/** `GET /api/books/{id}`. */
export function useBook(id: number): UseQueryResult<Book> {
  const api = useApi()
  return useQuery({
    queryKey: ['book', id],
    queryFn: () => api.getBook(id),
  })
}

/**
 * Marks everything a write to this book can have changed as out of date.
 *
 * One function rather than the same three `invalidateQueries` calls copied
 * into four mutations — the rule from docs/specs/code-style.md is that one
 * decision lives in one place, and "what does writing to a book affect" is
 * one decision.
 */
function useBookRefresh(id: number): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['book', id] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: ['shelves'] })
  }
}

/**
 * `PUT /api/books/{id}/state` — rating, progress, shelf placement.
 *
 * The reader's own state, so it commits the moment it changes. There is
 * nothing to confirm: nobody else sees it, and an undo is one more click on
 * the same control.
 */
export function useSetBookState(id: number): UseMutationResult<Book, Error, BookStateWrite> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: (state: BookStateWrite) => api.setBookState(id, state),
    onSuccess: refresh,
  })
}

/**
 * `PATCH /api/books/{id}` — the shared catalog, and admin only.
 *
 * Deferred rather than immediate, unlike the state above, because this is
 * everyone's copy of the book: a field that rewrote the catalog for the whole
 * household the instant it lost focus would be the wrong shape for a
 * correction somebody is halfway through typing.
 */
export function useUpdateBook(id: number): UseMutationResult<Book, Error, BookPatch> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: (patch: BookPatch) => api.updateBook(id, patch),
    onSuccess: refresh,
  })
}

/**
 * `POST /api/books/{id}/send-to-kindle`.
 *
 * Invalidates like the others because a send moves `last_sent_at`, which the
 * button reads back to answer "did I already send this?".
 */
export function useSendToKindle(id: number): UseMutationResult<KindleDelivery, Error, void> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: () => api.sendToKindle(id),
    onSuccess: refresh,
  })
}
