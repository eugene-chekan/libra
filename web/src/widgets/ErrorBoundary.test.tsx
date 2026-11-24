import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Crash(): never {
  throw new Error('a bug in a component')
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React itself also reports a caught error; this keeps the test output clean.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    vi.unstubAllGlobals()
  })

  it('shows its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>The library</p>
      </ErrorBoundary>
    )

    expect(screen.getByText('The library')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces a crashed screen with a page that says so, not a blank one', () => {
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
  })

  it('writes the error to the console, under libra’s own label', () => {
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>
    )

    expect(consoleError).toHaveBeenCalledWith(
      'libra: a screen crashed',
      expect.objectContaining({ message: 'a bug in a component' }),
      expect.any(String)
    )
  })

  it('reloads the page from its button', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <Crash />
      </ErrorBoundary>
    )

    await user.click(screen.getByRole('button', { name: 'Reload the page' }))

    expect(reload).toHaveBeenCalled()
  })
})
