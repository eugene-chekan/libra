import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Tag } from '../api/types'

/**
 * `GET /api/tags`. Shared between the sidebar's TAGS section and the search
 * box's autocomplete and `#tag` name resolution — one query key means both
 * read the same cached list rather than fetching it twice.
 */
export function useTags(): UseQueryResult<Tag[]> {
  const api = useApi()
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
  })
}
