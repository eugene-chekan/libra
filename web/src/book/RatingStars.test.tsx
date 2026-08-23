import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RatingStars } from './RatingStars'

describe('RatingStars', () => {
  it('offers one button per star, each saying what it would do', async () => {
    render(<RatingStars rating={0} onRate={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Rate 3 out of 5' })).toBeInTheDocument()
  })

  it('reports which stars are set, so the rating is readable without seeing it', () => {
    render(<RatingStars rating={3} onRate={vi.fn()} />)

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')

    expect(pressed).toHaveLength(3)
  })

  it('writes the rating that was clicked', async () => {
    const user = userEvent.setup()
    const onRate = vi.fn()
    render(<RatingStars rating={0} onRate={onRate} />)

    await user.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))

    expect(onRate).toHaveBeenCalledWith(4)
  })

  it('clears the rating when the star already given is clicked again', async () => {
    // Otherwise a rating is a decision that cannot be taken back: there is no
    // other control anywhere for "actually, no opinion".
    const user = userEvent.setup()
    const onRate = vi.fn()
    render(<RatingStars rating={4} onRate={onRate} />)

    await user.click(screen.getByRole('button', { name: 'Clear rating' }))

    expect(onRate).toHaveBeenCalledWith(0)
  })

  it('does not claim a star is set just because the mouse is over it', async () => {
    const user = userEvent.setup()
    render(<RatingStars rating={1} onRate={vi.fn()} />)

    await user.hover(screen.getByRole('button', { name: 'Rate 5 out of 5' }))

    // The drawing previews five; what is true is still one.
    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
  })
})
