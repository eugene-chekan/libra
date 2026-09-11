import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { User } from '../api/types'
import { queryKeys } from '../queryKeys'

/** `GET /api/users`. Admin only — the page that calls this is itself admin-gated. */
export function useUsers(): UseQueryResult<User[]> {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => api.listUsers(),
  })
}
