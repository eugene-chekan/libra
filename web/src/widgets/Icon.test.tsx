import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon, iconNames } from './Icon'

describe('Icon', () => {
  it('is hidden from assistive technology and skipped by the keyboard', () => {
    // An icon is decoration; the accessible name belongs to the control around
    // it. `focusable="false"` matters separately from `aria-hidden`, because
    // some browsers put SVG elements in the tab order without it.
    const { container } = render(<Icon name="plus" />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('inherits its colour from the text around it', () => {
    // This is what lets a nav row going active recolour its icon with no
    // extra rule for the icon itself.
    const { container } = render(<Icon name="grid" />)

    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor')
  })

  it('takes the size it is given, on both dimensions', () => {
    const { container } = render(<Icon name="rotate-cw" size={12} />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('width', '12')
    expect(svg).toHaveAttribute('height', '12')
  })

  it('draws something for every name it accepts', () => {
    // Guards against a name in the union with no path behind it, which would
    // render an empty box and look like a styling bug rather than a missing
    // icon. The list is imported, not retyped, so a new icon is covered the
    // moment it is added.
    for (const name of iconNames) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector('svg')?.children.length ?? 0).toBeGreaterThan(0)
      unmount()
    }
  })
})
