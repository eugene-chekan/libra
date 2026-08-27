import { useState } from 'react'

import { messageFor } from '../api/errors'
import type { User } from '../api/types'
import { useSession } from '../session/SessionProvider'
import { AddUserRow } from '../users/AddUserRow'
import { UserRow } from '../users/UserRow'
import { useUsers } from '../users/useUsers'
import { useCreateUser, useDeleteUser, useUpdateUser } from '../users/useUserWrites'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { SkeletonDelay, SkeletonRows } from '../widgets/Skeleton'
import styles from './AdminUsersScreen.module.css'

/** `/admin/users` — accounts: list, create, edit, delete. */
export function AdminUsersScreen() {
  const users = useUsers()
  const { status } = useSession()
  const callerId = status.status === 'signed-in' ? status.user.id : null

  const create = useCreateUser()
  const update = useUpdateUser()
  const remove = useDeleteUser()
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)

  const busy = create.isPending || update.isPending || remove.isPending
  const error = create.error ?? update.error ?? remove.error

  return (
    <>
      {users.isPending && (
        <SkeletonDelay>
          <SkeletonRows rows={3} height="52px" />
        </SkeletonDelay>
      )}

      {users.isError && (
        <ErrorBlock message={messageFor(users.error)} onRetry={() => void users.refetch()} />
      )}

      {users.isSuccess && (
        <ul className={styles.list}>
          {users.data.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === callerId}
              busy={busy}
              onSave={(patch) => update.mutate({ id: user.id, patch })}
              onDelete={() => setPendingDelete(user)}
            />
          ))}
        </ul>
      )}

      <AddUserRow busy={create.isPending} onCreate={(newUser) => create.mutate(newUser)} />

      {error && <ErrorBlock message={messageFor(error)} />}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.username}?`}
          message="Their shelves, personal tags, reading progress, notes, and sessions are deleted. Books they uploaded stay in the library."
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            remove.mutate(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </>
  )
}
