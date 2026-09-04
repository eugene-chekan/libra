import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Chapter } from './BookReader'
import { ContentsDrawer } from './ContentsDrawer'

// Spine positions, not list positions: a real book's front matter is absent from its own
// contents, so the third entry is the sixth section.
const CHAPTERS: Chapter[] = [
  { index: 2, label: 'The Beginning', depth: 0 },
  { index: 3, label: 'The Middle', depth: 0 },
  { index: 5, label: 'The End', depth: 1 },
]

describe('ContentsDrawer', () => {
  it('lists every chapter', () => {
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getAllByRole('button', { name: /^The / })).toHaveLength(3)
  })

  it('marks the entry covering where the reader is, not the one that matches exactly', () => {
    // Section 4 is inside "The Middle", which starts at 3 — there is no entry for 4 itself.
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={4} onChoose={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'The Middle' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(screen.getByRole('button', { name: 'The End' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing while the reader is in front matter', () => {
    // A title page belongs to no chapter, and claiming it is chapter one is a lie the
    // highlight would tell on every real book.
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={vi.fn()} onClose={vi.fn()} />
    )

    for (const label of ['The Beginning', 'The Middle', 'The End']) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-current')
    }
  })

  it('reports the chapter chosen', async () => {
    const onChoose = vi.fn()
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={onChoose} onClose={vi.fn()} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'The End' }))

    expect(onChoose).toHaveBeenCalledWith(5)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={vi.fn()} onClose={onClose} />
    )

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('says so when the book has no table of contents', () => {
    // Plenty of real EPUBs have a spine and no navigation document. An empty
    // drawer would read as a loading failure.
    render(<ContentsDrawer chapters={[]} currentIndex={0} onChoose={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('This book has no table of contents.')).toBeInTheDocument()
  })
})
