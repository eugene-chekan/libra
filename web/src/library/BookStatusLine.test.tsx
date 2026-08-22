import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BookStatusLine } from './BookStatusLine'

describe('BookStatusLine', () => {
  it('shows "Not started" for a book with zero progress', () => {
    render(<BookStatusLine progress={0} rating={0} />)

    expect(screen.getByText('Not started')).toBeInTheDocument()
  })

  it('shows a progress bar and percentage while partway through', () => {
    render(<BookStatusLine progress={0.42} rating={0} />)

    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('shows a read-only star rating once finished', () => {
    render(<BookStatusLine progress={1} rating={4} />)

    expect(screen.queryByText(/not started/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument()
  })

  it('shows an unrated finished book as zero stars, not "Not started"', () => {
    render(<BookStatusLine progress={1} rating={0} />)

    expect(screen.getByRole('img', { name: '0 out of 5 stars' })).toBeInTheDocument()
  })
})
