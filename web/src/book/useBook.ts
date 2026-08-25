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
