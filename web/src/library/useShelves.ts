import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Shelf } from '../api/types'
import { queryKeys } from '../queryKeys'

/** `GET /api/shelves`. */
export function useShelves(): UseQueryResult<Shelf[]> {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.shelves,
    queryFn: () => api.listShelves(),
  })
}
