import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Book } from '../api/types'
import { queryKeys } from '../queryKeys'

/** `POST /api/books/upload`. */
export function useUploadBook(): UseMutationResult<Book, Error, File> {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadBook(file),
    onSuccess: (book) => {
      // Seeds the detail query so the confirmation step renders with no extra
      // round trip — the response already carries everything `GET /books/{id}`
      // would return.
      queryClient.setQueryData(queryKeys.book(book.id), book)
      void queryClient.invalidateQueries({ queryKey: queryKeys.books })
    },
  })
}
