import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Tag } from '../api/types'

/** `GET /api/tags`. */
export function useTags(): UseQueryResult<Tag[]> {
  const api = useApi()
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
  })
}
