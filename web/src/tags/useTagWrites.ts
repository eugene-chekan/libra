import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Tag, TagCreate, TagPatch } from '../api/types'

/** Creating, renaming and deleting tags. */
function useTagRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['tags'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
  }
}

/** `POST /api/tags`. */
export function useCreateTag(): UseMutationResult<
  Tag,
  Error,
  { tag: TagCreate; makeGlobal?: boolean }
> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: ({ tag, makeGlobal }: { tag: TagCreate; makeGlobal?: boolean }) =>
      api.createTag(tag, makeGlobal),
    onSuccess: refresh,
  })
}

/** `PATCH /api/tags/{id}`. */
export function useUpdateTag(): UseMutationResult<Tag, Error, { id: number; patch: TagPatch }> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TagPatch }) => api.updateTag(id, patch),
    onSuccess: refresh,
  })
}

/**
 * `DELETE /api/tags/{id}`.
 *
 * `onDeleted` runs as part of the mutation's own `onSuccess`, not one passed
 * to `mutate()` — a call-level `onSuccess` only fires while the calling
 * component is still subscribed, and a delete confirmed then immediately
 * closed away can outlive that subscription.
 */
export function useDeleteTag(
  onDeleted?: (id: number) => void
): UseMutationResult<void, Error, number> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: (id: number) => api.deleteTag(id),
    onSuccess: (_data, id) => {
      refresh()
      onDeleted?.(id)
    },
  })
}
