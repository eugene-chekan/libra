import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { BookList, BookSearchParams } from '../api/types'

/** `GET /api/books`, cached by its own filter params. */
export function useBooks(params: BookSearchParams): UseQueryResult<BookList> {
  const api = useApi()
  return useQuery({
    queryKey: ['books', params],
    queryFn: () => api.listBooks(params),
  })
}
