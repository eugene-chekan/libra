import { Component, type ErrorInfo, type ReactNode } from 'react'

import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * Catches an error thrown while a component renders, so the reader gets a page that says so in
 * place of a blank one. A failed request never reaches here: each screen shows those itself.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('libra: a screen crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className={styles.page}>
        <div className={styles.card} role="alert">
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.text}>
            Libra hit an error it did not expect. Your books and notes are safe on the server.
            Reloading the page usually fixes it.
          </p>
          <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </main>
    )
  }
}
