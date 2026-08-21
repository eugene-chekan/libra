import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SKELETON_DELAY_MS } from '../theme/durations'
import { Skeleton, SkeletonDelay, SkeletonGrid, SkeletonRows } from './Skeleton'

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    // A dozen pulsing boxes announcing themselves individually is noise. The
    // region that is waiting announces the wait, once.
    const { container } = render(<Skeleton height="13px" />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('takes the width and height it is given', () => {
    const { container } = render(<Skeleton width="80%" height="13px" />)

    expect(container.firstElementChild).toHaveStyle({ width: '80%', height: '13px' })
  })
})

describe('SkeletonGrid', () => {
  it('renders twelve cells by default, matching the library grid', () => {
    const { container } = render(<SkeletonGrid />)

    // Three blocks per cell: the cover, then the two title lines.
    expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(12)
  })

  it('renders as many cells as it is asked for', () => {
    const { container } = render(<SkeletonGrid cells={4} />)

    expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(4)
  })
})

describe('SkeletonRows', () => {
  it('renders three rows by default, matching a list', () => {
    const { container } = render(<SkeletonRows />)

    expect(container.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3)
  })
})

describe('SkeletonDelay', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing before the delay has passed', () => {
    render(
      <SkeletonDelay>
        <p>loading</p>
      </SkeletonDelay>
    )

    // The whole point: on localhost most requests resolve faster than this,
    // and a skeleton that flashes for 40ms reads as a glitch.
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })

  it('shows its children once the delay has passed', () => {
    render(
      <SkeletonDelay>
        <p>loading</p>
      </SkeletonDelay>
    )

    // The constant is imported, never transcribed. A duration copied into a
    // test in this project had already drifted to 2600 against 2500ms.
    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS))

    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('is still hidden one millisecond before the delay', () => {
    render(
      <SkeletonDelay>
        <p>loading</p>
      </SkeletonDelay>
    )

    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS - 1))

    expect(screen.queryByText('loading')).not.toBeInTheDocument()
  })
})
