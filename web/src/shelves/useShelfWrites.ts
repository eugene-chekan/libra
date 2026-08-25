import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Shelf, ShelfCreate, ShelfPatch } from '../api/types'

/** Creating, changing, deleting and reordering shelves. */
function useShelfRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['shelves'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
  }
}

/** `POST /api/shelves`. */
export function useCreateShelf(): UseMutationResult<Shelf, Error, ShelfCreate> {
  const api = useApi()
  const refresh = useShelfRefresh()
  return useMutation({
    mutationFn: (shelf: ShelfCreate) => api.createShelf(shelf),
    onSuccess: refresh,
  })
}

/** `PATCH /api/shelves/{id}` — rename, publish, unpublish. */
export function useUpdateShelf(): UseMutationResult<
  Shelf,
  Error,
  { id: number; patch: ShelfPatch }
> {
  const api = useApi()
  const refresh = useShelfRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ShelfPatch }) => api.updateShelf(id, patch),
    onSuccess: refresh,
  })
}

/** `DELETE /api/shelves/{id}`. */
export function useDeleteShelf(): UseMutationResult<void, Error, number> {
  const api = useApi()
  const refresh = useShelfRefresh()
  return useMutation({
    mutationFn: (id: number) => api.deleteShelf(id),
    onSuccess: refresh,
  })
}

/** `PUT /api/shelves/order`, with the complete list in the order it should end up in. */
export function useReorderShelves(): UseMutationResult<Shelf[], Error, number[]> {
  const api = useApi()
  const refresh = useShelfRefresh()
  return useMutation({
    mutationFn: (shelfIds: number[]) => api.reorderShelves(shelfIds),
    onSuccess: refresh,
  })
}
