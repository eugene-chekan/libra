import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Shelf } from '../api/types'

/** `GET /api/shelves`. */
export function useShelves(): UseQueryResult<Shelf[]> {
  const api = useApi()
  return useQuery({
    queryKey: ['shelves'],
    queryFn: () => api.listShelves(),
  })
}
