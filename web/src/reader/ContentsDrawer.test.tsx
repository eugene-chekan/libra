import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Chapter } from './BookReader'
import { ContentsDrawer } from './ContentsDrawer'

const CHAPTERS: Chapter[] = [
  { index: 0, label: 'The Beginning' },
  { index: 1, label: 'The Middle' },
  { index: 2, label: 'The End' },
]

describe('ContentsDrawer', () => {
  it('lists every chapter', () => {
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getAllByRole('button', { name: /^The / })).toHaveLength(3)
  })

  it('marks the chapter being read', () => {
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={1} onChoose={vi.fn()} onClose={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'The Middle' })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(screen.getByRole('button', { name: 'The End' })).not.toHaveAttribute('aria-current')
  })

  it('reports the chapter chosen', async () => {
    const onChoose = vi.fn()
    render(
      <ContentsDrawer chapters={CHAPTERS} currentIndex={0} onChoose={onChoose} onClose={vi.fn()} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'The End' }))

    expect(onChoose).toHaveBeenCalledWith(2)
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
