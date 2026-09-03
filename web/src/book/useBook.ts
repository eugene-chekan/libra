import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book, BookPatch, BookStateWrite, KindleDelivery } from '../api/types'

/** The book detail screen's reads and writes. */

/** `GET /api/books/{id}`. */
export function useBook(id: number): UseQueryResult<Book> {
  const api = useApi()
  return useQuery({
    queryKey: ['book', id],
    queryFn: () => api.getBook(id),
  })
}

/** Marks everything a write to this book can have changed as out of date. */
function useBookRefresh(id: number): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['book', id] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: ['shelves'] })
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

/**
 * The reader's progress write. Deliberately does not refresh the book: the reader writes every
 * time scrolling pauses, and refetching the value it just sent would change `book.data` under
 * the screen that is reading from it, reopening the book mid-sentence. Nothing else on screen
 * shows this progress, and the detail screen refetches on mount anyway.
 */
/** Writes the reader's place. Sends only what is known: either may be unknown on its own. */
export function useWriteProgress(
  id: number
): UseMutationResult<Book, Error, { progress: number | null; position: string | null }> {
  const api = useApi()
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

/** `POST /api/books/{id}/send-to-kindle`. */
export function useSendToKindle(id: number): UseMutationResult<KindleDelivery, Error, void> {
  const api = useApi()
  const refresh = useBookRefresh(id)
  return useMutation({
    mutationFn: () => api.sendToKindle(id),
    onSuccess: refresh,
  })
}
