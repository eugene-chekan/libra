import { useState, type FormEvent } from 'react'

import type { UserCreate } from '../api/types'
import styles from './AddUserRow.module.css'

interface AddUserRowProps {
  busy: boolean
  onCreate: (user: UserCreate) => void
  /** Fires when Cancel closes the form, so a caller can drop a stale error alongside it. */
  onCancel: () => void
}

/** The dashed "+ Add User" row, expanding into an inline create form. */
export function AddUserRow({ busy, onCreate, onCancel }: AddUserRowProps) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  function reset() {
    setOpen(false)
    setUsername('')
    setPassword('')
    setIsAdmin(false)
  }

  function cancel() {
    reset()
    onCancel()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (username.trim() === '' || password === '' || busy) return
    onCreate({ username: username.trim(), password, is_admin: isAdmin })
    reset()
  }

  if (!open) {
    return (
      <button type="button" className={styles.addButton} onClick={() => setOpen(true)}>
        + Add User
      </button>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="new-user-username">
        Username
      </label>
      <input
        id="new-user-username"
        className={styles.input}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="off"
      />

      <label className={styles.label} htmlFor="new-user-password">
        Password
      </label>
      <input
        id="new-user-password"
        type="password"
        className={styles.input}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
      />

      <div className={styles.checkboxRow}>
        <input
          id="new-user-admin"
          type="checkbox"
          checked={isAdmin}
          onChange={(event) => setIsAdmin(event.target.checked)}
        />
        <label htmlFor="new-user-admin">Administrator</label>
      </div>

      <div className={styles.formFooter}>
        <button type="button" className={styles.cancel} onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className={styles.create} disabled={busy}>
          Create
        </button>
      </div>
    </form>
  )
}
