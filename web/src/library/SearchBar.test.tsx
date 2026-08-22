import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Tag } from '../api/types'
import { SearchBar } from './SearchBar'

const TAGS: Tag[] = [
  { id: 1, name: 'Sci-Fi', owner_id: null, is_global: true },
  { id: 2, name: 'Sci-Fi Classics', owner_id: null, is_global: true },
  { id: 3, name: 'Fantasy', owner_id: null, is_global: true },
]

/** A real controlled wrapper — `onChange` alone, unwired to state, would leave `value` frozen as the user types. */
function ControlledSearchBar({
  initial = '',
  activeHashTagNames = [],
  onChangeSpy,
}: {
  initial?: string
  activeHashTagNames?: string[]
  onChangeSpy?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <SearchBar
      value={value}
      onChange={(next) => {
        setValue(next)
        onChangeSpy?.(next)
      }}
      tags={TAGS}
      activeHashTagNames={activeHashTagNames}
    />
  )
}

describe('SearchBar', () => {
  it('has the placeholder client-design.md specifies', () => {
    render(<ControlledSearchBar />)

    expect(screen.getByPlaceholderText('Search books, authors… or type #tag')).toBeInTheDocument()
  })

  it('reports every keystroke to onChange', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<ControlledSearchBar onChangeSpy={onChangeSpy} />)

    await user.type(screen.getByRole('textbox'), 'dune')

    expect(onChangeSpy).toHaveBeenLastCalledWith('dune')
  })

  it('shows matching tag suggestions once the cursor is inside a #token', async () => {
    const user = userEvent.setup()
    render(<ControlledSearchBar />)

    await user.type(screen.getByRole('textbox'), 'dune #sci')

    expect(screen.getByRole('option', { name: '#Sci-Fi' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '#Sci-Fi Classics' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '#Fantasy' })).not.toBeInTheDocument()
  })

  it('excludes a tag that is already applied from its own suggestions', async () => {
    const user = userEvent.setup()
    render(<ControlledSearchBar activeHashTagNames={['sci-fi']} />)

    await user.type(screen.getByRole('textbox'), '#sci')

    expect(screen.queryByRole('option', { name: '#Sci-Fi' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: '#Sci-Fi Classics' })).toBeInTheDocument()
  })

  it('replaces the token and appends a trailing space when a suggestion is picked', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<ControlledSearchBar onChangeSpy={onChangeSpy} />)

    await user.type(screen.getByRole('textbox'), 'dune #sci')
    await user.click(screen.getByRole('option', { name: '#Sci-Fi' }))

    expect(onChangeSpy).toHaveBeenLastCalledWith('dune #Sci-Fi ')
    expect(screen.getByRole('textbox')).toHaveValue('dune #Sci-Fi ')
  })

  it('shows no suggestions once the token no longer starts with #', async () => {
    const user = userEvent.setup()
    render(<ControlledSearchBar />)

    await user.type(screen.getByRole('textbox'), '#sci')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), ' fi')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
