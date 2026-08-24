import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Shelf, ShelfCreate, ShelfPatch } from '../api/types'

/**
 * Creating, changing, deleting and reordering shelves.
 *
 * **Every write here invalidates the shelf list and the library grid**, for
 * the same reason the book screen's writes do: a shelf is a filter over that
 * grid, so renaming one changes the filter pill's text, deleting one unshelves
 * its books, and both change what the sidebar shows. One helper rather than
 * the same two calls copied into four mutations.
 *
 * Reads stay in `useShelves`, which the sidebar and the library screen already
 * share. Nothing here fetches — a write invalidates and lets that one query
 * refetch, so there is still exactly one place the shelf list comes from.
 */
function useShelfRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['shelves'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
  }
}

/** `POST /api/shelves`. 409 when the reader already has that name, ignoring case. */
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

/** `DELETE /api/shelves/{id}`. The books on it stay in the library, unshelved. */
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
