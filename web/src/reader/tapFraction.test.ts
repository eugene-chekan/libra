import { describe, expect, it } from 'vitest'

import { tapFraction } from './tapFraction'

/** The visible page from the probe that found the bug: 358px wide, 16px from the app's left. */
const PAGE = { left: 16, width: 358 }

/**
 * A stand-in for the iframe's own window. epub.js cannot run in jsdom, but nothing here needs
 * epub.js — only where the iframe sits, how wide it is, and any selected text.
 */
function view({
  innerWidth,
  frameLeft,
  selected = '',
}: {
  innerWidth: number
  frameLeft: number
  selected?: string
}): Window {
  return {
    innerWidth,
    getSelection: () => ({ toString: () => selected }) as Selection,
    frameElement: { getBoundingClientRect: () => ({ left: frameLeft }) as DOMRect },
  } as unknown as Window
}

/** A click. `clientX` is measured from the iframe's own left edge, as a browser does. */
function clickAt(x: number, target: Element = document.createElement('p')): MouseEvent {
  const event = new MouseEvent('click', { clientX: x })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

/** A chapter short enough to fit on one page, so the iframe is exactly as wide as the page. */
const onePage = () => view({ innerWidth: PAGE.width, frameLeft: PAGE.left })

describe('tapFraction', () => {
  it('reports where across the visible page the tap landed', () => {
    expect(tapFraction(clickAt(0.2 * 358), onePage(), PAGE)).toBeCloseTo(0.2)
    expect(tapFraction(clickAt(0.5 * 358), onePage(), PAGE)).toBeCloseTo(0.5)
    expect(tapFraction(clickAt(0.9 * 358), onePage(), PAGE)).toBeCloseTo(0.9)
  })

  it('measures against the page, not the iframe, when the chapter is longer than a page', () => {
    // The bug a real phone found. epub.js makes the iframe as wide as the whole chapter: here
    // four pages, 1432px. A tap at 85% of the page is clientX 304. But 304 / 1432 is 0.21, which
    // counted as a tap on the left and turned the page back.
    const wide = view({ innerWidth: 4 * 358, frameLeft: PAGE.left })

    expect(tapFraction(clickAt(304), wide, PAGE)).toBeCloseTo(304 / 358)
  })

  it('allows for the chapter having slid left to show a later page', () => {
    // epub.js turns a page by sliding the wide iframe one page to the left. On the second page
    // the iframe starts 358px further left, and clientX is 358px larger for the same spot.
    const slid = view({ innerWidth: 4 * 358, frameLeft: PAGE.left - 358 })

    expect(tapFraction(clickAt(304 + 358), slid, PAGE)).toBeCloseTo(304 / 358)
  })

  it('ignores a tap that finished selecting a word', () => {
    // Selecting text ends in a click. Turning the page then would move the book away from the
    // words the reader just chose.
    const selecting = view({ innerWidth: 358, frameLeft: PAGE.left, selected: 'a quoted phrase' })

    expect(tapFraction(clickAt(320), selecting, PAGE)).toBeNull()
  })

  it('ignores a tap on a link, and on anything inside one', () => {
    const link = document.createElement('a')
    const span = document.createElement('span')
    link.append(span)

    expect(tapFraction(clickAt(320, link), onePage(), PAGE)).toBeNull()
    expect(tapFraction(clickAt(320, span), onePage(), PAGE)).toBeNull()
  })

  it('ignores a tap it cannot place', () => {
    // A page of zero width is not laid out yet. Dividing by it gives Infinity, which counts as a
    // tap on the far right and turns the page.
    expect(tapFraction(clickAt(320), onePage(), { left: 16, width: 0 })).toBeNull()
    expect(tapFraction(clickAt(320), null, PAGE)).toBeNull()
    expect(
      tapFraction(clickAt(320), Object.assign(onePage(), { frameElement: null }), PAGE)
    ).toBeNull()
  })
})
