import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('shows the title', () => {
    render(<EmptyState title="Your library is empty" />)

    expect(screen.getByText('Your library is empty')).toBeInTheDocument()
  })

  it('shows the hint when there is one', () => {
    render(<EmptyState title="Your library is empty" hint="Add an EPUB to get started." />)

    expect(screen.getByText('Add an EPUB to get started.')).toBeInTheDocument()
  })

  it('renders the action it is given', () => {
    render(<EmptyState title="Your library is empty" action={<button>Add Book</button>} />)

    expect(screen.getByRole('button', { name: 'Add Book' })).toBeInTheDocument()
  })

  it('renders neither hint nor action when it has none', () => {
    const { container } = render(<EmptyState title="Nothing here" />)

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
