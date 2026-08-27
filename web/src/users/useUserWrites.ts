import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { User, UserCreate, UserPatch } from '../api/types'
import { useSession } from '../session/SessionProvider'

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

/** `PATCH /api/users/{id}`. Keeps the session in step when the caller edits their own row. */
export function useUpdateUser(): UseMutationResult<User, Error, { id: number; patch: UserPatch }> {
  const api = useApi()
  const refresh = useUserRefresh()
  const { status, setUser } = useSession()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UserPatch }) => api.updateUser(id, patch),
    onSuccess: (updated) => {
      refresh()
      if (status.status === 'signed-in' && status.user.id === updated.id) setUser(updated)
    },
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
