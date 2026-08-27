import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { User, UserCreate, UserPatch } from '../api/types'

/** Creating, changing and deleting accounts. */
function useUserRefresh(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }
}

/** `POST /api/users`. */
export function useCreateUser(): UseMutationResult<User, Error, UserCreate> {
  const api = useApi()
  const refresh = useUserRefresh()
  return useMutation({
    mutationFn: (user: UserCreate) => api.createUser(user),
    onSuccess: refresh,
  })
}

/** `PATCH /api/users/{id}`. */
export function useUpdateUser(): UseMutationResult<
  User,
  Error,
  { id: number; patch: UserPatch }
> {
  const api = useApi()
  const refresh = useUserRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UserPatch }) => api.updateUser(id, patch),
    onSuccess: refresh,
  })
}

/** `DELETE /api/users/{id}`. */
export function useDeleteUser(): UseMutationResult<void, Error, number> {
  const api = useApi()
  const refresh = useUserRefresh()
  return useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: refresh,
  })
}
