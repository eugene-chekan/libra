import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { routes } from '../routes'
import { useSession } from '../session/SessionProvider'
import { Icon } from '../widgets/Icon'
import styles from './LoginScreen.module.css'

/**
 * Route `/login`. No sidebar — reached both before any session exists and
 * after one just ended, so it cannot assume the frame around it is safe to
 * show.
 *
 * The error copy is fixed and never says which field was wrong. That is not
 * vagueness: the backend's `auth.authenticate` checks an unknown username
 * against a dummy password hash specifically so the response takes the same
 * time either way, and a screen that says "no such user" would hand back
 * exactly what that effort is spent concealing.
 */
export function LoginScreen() {
  const { status, login } = useSession()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const expired = status.status === 'signed-out' && status.reason === 'expired'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!username || !password || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      navigate(searchParams.get('next') || routes.library, { replace: true })
    } catch {
      setError('Incorrect username or password.')
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Libra</h1>

        {expired && <p className={styles.expired}>Your session expired. Please sign in again.</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className={styles.input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              // The field is the only reason this page exists, so focus
              // here skips nothing the reader would otherwise land on.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              <Icon name="alert-circle" size={14} className={styles.errorIcon} />
              {error}
            </p>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={!username || !password || submitting}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}
