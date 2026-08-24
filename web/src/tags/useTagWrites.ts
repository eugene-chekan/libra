import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Tag, TagCreate, TagPatch } from '../api/types'

/**
 * Creating, renaming and deleting tags.
 *
 * **Every write invalidates the tag list and the library grid**, the same pair
 * the shelf writes invalidate and for the same reason: a tag is a filter over
 * that grid. Renaming one changes the filter pill's text, deleting one takes
 * it off every book it was on, and both change what the sidebar lists.
 *
 * Reads stay in `useTags`, which the sidebar and the search box already share.
 * Nothing here fetches — a write invalidates and lets that one query refetch,
 * so there is still exactly one place the vocabulary comes from.
 */
function useTagRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['tags'] })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
  }
}

/**
 * `POST /api/tags`. Always a personal tag: a global one is admin-only and
 * changes what the whole household sees.
 *
 * 422 for a blank name, and 422 for a name with a space in it. 409 when the
 * caller already has that name or a global tag holds it, ignoring case.
 */
export function useCreateTag(): UseMutationResult<Tag, Error, TagCreate> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: (tag: TagCreate) => api.createTag(tag),
    onSuccess: refresh,
  })
}

/** `PATCH /api/tags/{id}`. A rename moves no books — they hold the tag's id. */
export function useUpdateTag(): UseMutationResult<Tag, Error, { id: number; patch: TagPatch }> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TagPatch }) => api.updateTag(id, patch),
    onSuccess: refresh,
  })
}

/** `DELETE /api/tags/{id}`. It comes off every book it was on; the books stay. */
export function useDeleteTag(): UseMutationResult<void, Error, number> {
  const api = useApi()
  const refresh = useTagRefresh()
  return useMutation({
    mutationFn: (id: number) => api.deleteTag(id),
    onSuccess: refresh,
  })
}
