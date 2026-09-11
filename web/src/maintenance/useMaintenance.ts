import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { MaintenanceReport } from '../api/types'
import { queryKeys } from '../queryKeys'

/** `GET /api/maintenance` — the whole tab in one read. */
export function useMaintenance(): UseQueryResult<MaintenanceReport> {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.maintenance, queryFn: () => api.getMaintenance() })
}

/** Every write here changes the report, and the report is the only thing on the page. */
function useReportRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance })
}

/** `POST /api/maintenance/prune-sessions` — answers how many went. */
export function usePruneSessions(): UseMutationResult<number, Error, void> {
  const api = useApi()
  const refresh = useReportRefresh()
  return useMutation({ mutationFn: () => api.pruneSessions(), onSuccess: refresh })
}

/** `POST /api/maintenance/vacuum` — answers how many bytes came back. */
export function useVacuum(): UseMutationResult<number, Error, void> {
  const api = useApi()
  const refresh = useReportRefresh()
  return useMutation({ mutationFn: () => api.vacuum(), onSuccess: refresh })
}

/** `DELETE /api/maintenance/orphans/{name}` — one file at a time, never in bulk. */
export function useDeleteOrphan(): UseMutationResult<void, Error, string> {
  const api = useApi()
  const refresh = useReportRefresh()
  return useMutation({ mutationFn: (name: string) => api.deleteOrphan(name), onSuccess: refresh })
}
