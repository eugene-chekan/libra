import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book } from '../api/types'

/** The Edit Book form's cover writes: choose a file, paste a link, or undo both. */

/**
 * A cover shows wherever a book does, so a write to it marks the same views out
 * of date as every other book write — see `useBookRefresh` in `useBook.ts`.
 */
function useCoverRefresh(bookId: number): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['book', bookId] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: ['shelves'] })
  }
}

/** `PUT /api/books/{id}/cover` — set the cover from an uploaded picture. Admin only. */
export function useSetCover(bookId: number): UseMutationResult<Book, Error, File> {
  const api = useApi()
  const refresh = useCoverRefresh(bookId)
  return useMutation({
    mutationFn: (file: File) => api.setCover(bookId, file),
    onSuccess: refresh,
  })
}

/** `POST /api/books/{id}/cover/from-url` — set it from a link. Admin only. */
export function useSetCoverFromUrl(bookId: number): UseMutationResult<Book, Error, string> {
  const api = useApi()
  const refresh = useCoverRefresh(bookId)
  return useMutation({
    mutationFn: (url: string) => api.setCoverFromUrl(bookId, url),
    onSuccess: refresh,
  })
}

/** `DELETE /api/books/{id}/cover` — drop the custom cover, so the book's own comes back. Admin only. */
export function useClearCover(bookId: number): UseMutationResult<Book, Error, void> {
  const api = useApi()
  const refresh = useCoverRefresh(bookId)
  return useMutation({
    mutationFn: () => api.clearCover(bookId),
    onSuccess: refresh,
  })
}
