import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book, BookPatch, BookStateWrite, KindleDelivery } from '../api/types'
import { queryKeys } from '../queryKeys'

/** `GET /api/books/{id}`. */
export function useBook(id: number): UseQueryResult<Book> {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.book(id),
    queryFn: () => api.getBook(id),
  })
}

/** Marks everything a write to this book can have changed as out of date. */
export function useBookRefresh(id: number): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.book(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.books })
    void queryClient.invalidateQueries({ queryKey: queryKeys.shelves })
  }
}

/** `PUT /api/books/{id}/state` — rating, progress, shelf placement. */
export function useSetBookState(id: number): UseMutationResult<Book, Error, BookStateWrite> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: (state: BookStateWrite) => api.setBookState(id, state),
    onSuccess: refresh,
  })
}

/** Writes the reader's place. Sends only what is known: either may be unknown on its own. */
export function useWriteProgress(
  id: number
): UseMutationResult<Book, Error, { progress: number | null; position: string | null }> {
  const api = useApi()
  // No refresh on success. The reader writes every time scrolling pauses, and refetching the
  // value it just sent would change `book.data` under the reader, reopening the book mid-sentence.
  return useMutation({
    mutationFn: ({ progress, position }: { progress: number | null; position: string | null }) =>
      api.setBookState(id, {
        ...(progress === null ? {} : { progress }),
        ...(position === null ? {} : { position }),
      }),
  })
}

/** `PATCH /api/books/{id}` — the shared catalog, and admin only. */
export function useUpdateBook(id: number): UseMutationResult<Book, Error, BookPatch> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: (patch: BookPatch) => api.updateBook(id, patch),
    onSuccess: refresh,
  })
}

/**
 * `DELETE /api/books/{id}` — admin only.
 *
 * Drops this book's own cache entry rather than marking it stale, because there is nothing left
 * to fetch: invalidating would send a request for a book that is now a 404.
 */
export function useDeleteBook(id: number): UseMutationResult<void, Error, void> {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.deleteBook(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.book(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.books })
      void queryClient.invalidateQueries({ queryKey: queryKeys.shelves })
    },
  })
}

/** `POST /api/books/{id}/send-to-kindle`. */
export function useSendToKindle(id: number): UseMutationResult<KindleDelivery, Error, void> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: () => api.sendToKindle(id),
    onSuccess: refresh,
  })
}
