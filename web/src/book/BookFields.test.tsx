import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  BookFields,
  bookFieldsToPatch,
  bookFieldsValuesFrom,
  checkBookFields,
  type BookFieldsValues,
} from './BookFields'

const filled: BookFieldsValues = {
  title: 'Dune',
  author: 'Frank Herbert',
  year: '1965',
  pages: '412',
  blurb: '',
}

describe('BookFields', () => {
  it('shows the values it is given', () => {
    render(<BookFields values={filled} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Title')).toHaveValue('Dune')
    expect(screen.getByLabelText('Author')).toHaveValue('Frank Herbert')
    expect(screen.getByLabelText('Year')).toHaveValue('1965')
    expect(screen.getByLabelText('Pages')).toHaveValue('412')
  })

  it('reports the whole set of values on every keystroke, not just the field that changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<BookFields values={filled} onChange={onChange} />)

    await user.type(screen.getByLabelText('Author'), '!')

    expect(onChange).toHaveBeenLastCalledWith({ ...filled, author: 'Frank Herbert!' })
  })

  it('disables every field rather than hiding them, so a reader can still see what was parsed', () => {
    render(<BookFields values={filled} onChange={vi.fn()} disabled />)

    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByLabelText('Author')).toBeDisabled()
    expect(screen.getByLabelText('Year')).toBeDisabled()
    expect(screen.getByLabelText('Pages')).toBeDisabled()
    expect(screen.getByLabelText('Blurb')).toBeDisabled()
  })
})

describe('checkBookFields', () => {
  it('passes a fully valid set', () => {
    expect(checkBookFields(filled)).toBeNull()
  })

  it('refuses an empty title', () => {
    expect(checkBookFields({ ...filled, title: '  ' })).toBe('A book needs a title.')
  })

  it('refuses an empty author', () => {
    expect(checkBookFields({ ...filled, author: '' })).toContain('needs an author')
  })

  it('refuses a year that is not a number', () => {
    expect(checkBookFields({ ...filled, year: '19x5' })).toContain('has to be a number')
  })

  it('refuses pages below 1', () => {
    expect(checkBookFields({ ...filled, pages: '0' })).toContain('1 or more')
  })

  it('allows a blank year and a blank page count', () => {
    expect(checkBookFields({ ...filled, year: '', pages: '' })).toBeNull()
  })
})

describe('bookFieldsToPatch', () => {
  it('trims text and turns a blank number box into null', () => {
    expect(bookFieldsToPatch({ ...filled, year: '', pages: '', blurb: '  ' })).toEqual({
      title: 'Dune',
      author: 'Frank Herbert',
      year: null,
      pages: null,
      blurb: null,
    })
  })

  it('parses filled number boxes', () => {
    expect(bookFieldsToPatch(filled)).toMatchObject({ year: 1965, pages: 412 })
  })
})

describe('bookFieldsValuesFrom', () => {
  it('turns a null year, pages and blurb into empty boxes', () => {
    expect(
      bookFieldsValuesFrom({
        title: 'Dune',
        author: 'Frank Herbert',
        year: null,
        pages: null,
        blurb: null,
      })
    ).toEqual({ title: 'Dune', author: 'Frank Herbert', year: '', pages: '', blurb: '' })
  })

  it('stringifies a known year, pages and blurb', () => {
    expect(
      bookFieldsValuesFrom({
        title: 'Dune',
        author: 'Frank Herbert',
        year: 1965,
        pages: 412,
        blurb: 'Desert planet politics.',
      })
    ).toEqual({
      title: 'Dune',
      author: 'Frank Herbert',
      year: '1965',
      pages: '412',
      blurb: 'Desert planet politics.',
    })
  })
})
