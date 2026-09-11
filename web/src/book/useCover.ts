import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book } from '../api/types'
import { useBookRefresh } from './useBook'

/** `PUT /api/books/{id}/cover` — set the cover from an uploaded picture. Admin only. */
export function useSetCover(bookId: number): UseMutationResult<Book, Error, File> {
  const api = useApi()
  const refresh = useBookRefresh(bookId)
  return useMutation({
    mutationFn: (file: File) => api.setCover(bookId, file),
    onSuccess: refresh,
  })
}

/** `POST /api/books/{id}/cover/from-url` — set it from a link. Admin only. */
export function useSetCoverFromUrl(bookId: number): UseMutationResult<Book, Error, string> {
  const api = useApi()
  const refresh = useBookRefresh(bookId)
  return useMutation({
    mutationFn: (url: string) => api.setCoverFromUrl(bookId, url),
    onSuccess: refresh,
  })
}

/** `DELETE /api/books/{id}/cover` — drop the custom cover, so the book's own comes back. Admin only. */
export function useClearCover(bookId: number): UseMutationResult<Book, Error, void> {
  const api = useApi()
  const refresh = useBookRefresh(bookId)
  return useMutation({
    mutationFn: () => api.clearCover(bookId),
    onSuccess: refresh,
  })
}
