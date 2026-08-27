import { useState } from 'react'

import type { User, UserPatch } from '../api/types'
import { Icon } from '../widgets/Icon'
import styles from './UserRow.module.css'

interface UserRowProps {
  user: User
  /** True for the signed-in caller's own row. */
  isSelf: boolean
  busy: boolean
  onSave: (patch: UserPatch) => void
  onDelete: () => void
}

/** One row of the admin Users list: identity, and what can be done to the account. */
export function UserRow({ user, isSelf, busy, onSave, onDelete }: UserRowProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className={styles.row}>
        <UserEditor
          user={user}
          isSelf={isSelf}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            setEditing(false)
            onSave(patch)
          }}
        />
      </li>
    )
  }

  return (
    <li className={styles.row}>
      <span className={styles.avatar}>{user.username.charAt(0).toUpperCase()}</span>
      <span className={styles.identity}>
        <span className={styles.username}>{user.username}</span>
        {user.kindle_email ? (
          <span className={styles.kindle}>{user.kindle_email}</span>
        ) : (
          <span className={styles.noKindle}>No Kindle address</span>
        )}
      </span>
      {user.is_admin && <span className={styles.adminBadge}>Admin</span>}

      <button
        type="button"
        className={styles.action}
        aria-label={`Edit ${user.username}`}
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        <Icon name="pencil" size={14} />
      </button>
      {/* Self-deletion is refused by the endpoint regardless; hiding the
          control here is the courtesy, not the guard. */}
      {!isSelf && (
        <button
          type="button"
          className={`${styles.action} ${styles.danger}`}
          aria-label={`Delete ${user.username}`}
          disabled={busy}
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </li>
  )
}

/** The row's edit state: Kindle address, admin status, and an optional new password. */
function UserEditor({
  user,
  isSelf,
  onSave,
  onCancel,
}: {
  user: User
  isSelf: boolean
  onSave: (patch: UserPatch) => void
  onCancel: () => void
}) {
  const [kindleEmail, setKindleEmail] = useState(user.kindle_email ?? '')
  const [isAdmin, setIsAdmin] = useState(user.is_admin)
  const [newPassword, setNewPassword] = useState('')
  const kindleId = `user-kindle-${user.id}`
  const adminId = `user-admin-${user.id}`
  const passwordId = `user-password-${user.id}`

  function save() {
    const patch: UserPatch = {
      kindle_email: kindleEmail.trim() === '' ? null : kindleEmail.trim(),
      is_admin: isAdmin,
    }
    if (newPassword.trim() !== '') patch.password = newPassword
    onSave(patch)
  }

  return (
    <div className={styles.editor}>
      <label className={styles.label} htmlFor={kindleId}>
        Kindle address
      </label>
      <input
        id={kindleId}
        className={styles.input}
        value={kindleEmail}
        onChange={(event) => setKindleEmail(event.target.value)}
      />

      <div className={styles.checkboxRow}>
        <input
          id={adminId}
          type="checkbox"
          checked={isAdmin}
          disabled={isSelf}
          onChange={(event) => setIsAdmin(event.target.checked)}
        />
        <label htmlFor={adminId}>Administrator</label>
      </div>

      <label className={styles.label} htmlFor={passwordId}>
        Set new password
      </label>
      <input
        id={passwordId}
        type="password"
        className={styles.input}
        value={newPassword}
        placeholder="Leave blank to keep the current password"
        onChange={(event) => setNewPassword(event.target.value)}
      />

      <div className={styles.editorFooter}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.save} onClick={save}>
          Save
        </button>
      </div>
    </div>
  )
}
