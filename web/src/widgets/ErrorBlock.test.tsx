import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorBlock } from './ErrorBlock'

describe('ErrorBlock', () => {
  it('shows the message', () => {
    render(<ErrorBlock message="The library could not be loaded." />)

    expect(screen.getByText('The library could not be loaded.')).toBeInTheDocument()
  })

  it('announces itself, so a screen reader hears the failure', () => {
    render(<ErrorBlock message="Something went wrong." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
  })

  it('offers Try again as a real button, and calls back when it is pressed', async () => {
    const onRetry = vi.fn()
    render(<ErrorBlock message="Failed." onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('answers the keyboard, because it is a button and not a clickable div', async () => {
    const onRetry = vi.fn()
    render(<ErrorBlock message="Failed." onRetry={onRetry} />)

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows a way out where retrying is not one', () => {
    // The reader's unreadable-file case: nothing to retry, but the book's own
    // page still has a Download button that works.
    render(<ErrorBlock message="This file is not readable." action={<a href="/books/1">Back</a>} />)

    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('offers no retry when there is nothing useful to retry', () => {
    // A 403 will not become a 200 because the reader pressed a button, and
    // offering the button claims otherwise.
    render(<ErrorBlock message="You do not have access to this." />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
