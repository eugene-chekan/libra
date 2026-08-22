import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FilterSummary } from './FilterSummary'

describe('FilterSummary', () => {
  it('renders nothing when no filter is active', () => {
    const { container } = render(<FilterSummary shelf={null} tags={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the shelf pill first, then tag pills, with the (OR) hint only on the tag group', () => {
    render(
      <FilterSummary
        shelf={{ id: 1, name: 'Currently Reading' }}
        tags={[
          { id: 2, name: 'Sci-Fi' },
          { id: 3, name: 'Favorites' },
        ]}
      />
    )

    const pills = screen.getAllByTestId(/^pill-/)
    expect(pills.map((p) => p.textContent)).toEqual(['Currently Reading', 'Sci-Fi', 'Favorites'])
    expect(screen.getByText('(OR)')).toBeInTheDocument()
  })

  it('shows the shelf pill alone, with no (OR) hint, when there are no active tags', () => {
    render(<FilterSummary shelf={{ id: 1, name: 'To Read' }} tags={[]} />)

    expect(screen.getByText('To Read')).toBeInTheDocument()
    expect(screen.queryByText('(OR)')).not.toBeInTheDocument()
  })

  it('shows the (OR) hint with tags alone and no shelf', () => {
    render(<FilterSummary shelf={null} tags={[{ id: 1, name: 'Fantasy' }]} />)

    expect(screen.getByText('Fantasy')).toBeInTheDocument()
    expect(screen.getByText('(OR)')).toBeInTheDocument()
  })

  it('labels the row "Filtered by:"', () => {
    render(<FilterSummary shelf={null} tags={[{ id: 1, name: 'Fantasy' }]} />)

    expect(screen.getByText('Filtered by:')).toBeInTheDocument()
  })
})
