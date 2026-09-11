import { describe, expect, it } from 'vitest'

import { tapFraction } from './tapFraction'

/**
 * A stand-in for the iframe's own window. The real one comes from epub.js's `Contents`, which
 * cannot run in jsdom — but nothing here needs epub.js, only a width and a selection.
 */
function view(width: number, selected = ''): Window {
  return {
    innerWidth: width,
    getSelection: () => ({ toString: () => selected }) as Selection,
  } as unknown as Window
}

function clickAt(x: number, target: Element = document.createElement('p')): MouseEvent {
  const event = new MouseEvent('click', { clientX: x })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('tapFraction', () => {
  it('reports where across the page the tap landed', () => {
    expect(tapFraction(clickAt(78), view(390))).toBeCloseTo(0.2)
    expect(tapFraction(clickAt(195), view(390))).toBeCloseTo(0.5)
    expect(tapFraction(clickAt(351), view(390))).toBeCloseTo(0.9)
  })

  it('ignores a tap that finished selecting a word', () => {
    // Selecting text ends in a click. Turning the page then would move the book out from
    // under the reader at the exact moment they meant to hold still.
    expect(tapFraction(clickAt(351), view(390, 'a quoted phrase'))).toBeNull()
  })

  it('ignores a tap on a link, and on anything inside one', () => {
    const link = document.createElement('a')
    const span = document.createElement('span')
    link.append(span)

    expect(tapFraction(clickAt(351, link), view(390))).toBeNull()
    expect(tapFraction(clickAt(351, span), view(390))).toBeNull()
  })

  it('ignores a tap it cannot place', () => {
    // A width of zero means the book is not laid out yet. Dividing by it reports Infinity,
    // which the screen would read as a page turn.
    expect(tapFraction(clickAt(351), view(0))).toBeNull()
    expect(tapFraction(clickAt(351), null)).toBeNull()
  })
})
