import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { fakeShelf } from '../api/FakeLibraApi'
import { MoveToShelfButton } from './MoveToShelfButton'

describe('MoveToShelfButton', () => {
  it("lists the reader's own shelves and moves the book to the one chosen", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const shelf = fakeShelf({ id: 3, name: 'Reading Now', editable: true })
    render(<MoveToShelfButton shelves={[shelf]} currentShelfId={null} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reading Now' }))

    expect(onSelect).toHaveBeenCalledWith(3)
  })

  it("never offers somebody else's shelf, because filling one is a 403", async () => {
    // `GET /shelves` returns other readers' public shelves so the library can
    // be filtered by them. Placing a book on one is refused, so a row for it
    // would be a control that cannot work.
    const user = userEvent.setup()
    const theirs = fakeShelf({ id: 9, name: 'Their Shelf', editable: false })
    const mine = fakeShelf({ id: 3, name: 'My Shelf', editable: true })
    render(<MoveToShelfButton shelves={[theirs, mine]} currentShelfId={null} onSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))

    expect(await screen.findByRole('menuitem', { name: 'My Shelf' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Their Shelf' })).not.toBeInTheDocument()
  })

  it('offers "Remove from shelf" only when the book is on one', async () => {
    const user = userEvent.setup()
    const shelf = fakeShelf({ id: 3, name: 'Reading Now', editable: true })
    const onSelect = vi.fn()
    const { unmount } = render(
      <MoveToShelfButton shelves={[shelf]} currentShelfId={null} onSelect={onSelect} />
    )

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    expect(screen.queryByRole('menuitem', { name: /Remove from shelf/ })).not.toBeInTheDocument()
    unmount()

    render(<MoveToShelfButton shelves={[shelf]} currentShelfId={3} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Remove from shelf/ }))

    // Null, not a shelf id: that is what takes the book off its shelf.
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('says so when the reader has no shelves yet, rather than opening an empty menu', async () => {
    const user = userEvent.setup()
    render(<MoveToShelfButton shelves={[]} currentShelfId={null} onSelect={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))

    expect(await screen.findByText('No shelves yet')).toBeInTheDocument()
  })
})
