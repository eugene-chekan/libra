import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { BookList, BookSearchParams } from '../api/types'

/**
 * `GET /api/books`, cached by its own filter params. Two screens never share
 * a cache entry for different filters, and the same filter never fires a
 * second request while the first is still in flight.
 */
export function useBooks(params: BookSearchParams): UseQueryResult<BookList> {
  const api = useApi()
  return useQuery({
    queryKey: ['books', params],
    queryFn: () => api.listBooks(params),
  })
}
