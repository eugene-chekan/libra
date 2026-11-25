import { afterEach, describe, expect, it } from 'vitest'

import { pullInOffPage } from './offPage'

/** Places `element` from `left` to `right`, as a browser that had laid the page out would. */
function placeAt(element: Element, left: number, right: number): void {
  element.getBoundingClientRect = () => ({ left, right }) as DOMRect
}

/**
 * The title page of Henry Adams's "Democracy" from Standard Ebooks, the book that found the bug,
 * with the places Chrome gave its elements. The heading and the author line are hidden 999em to
 * the left.
 */
function titlePage(): { heading: HTMLElement; author: HTMLElement; image: HTMLElement } {
  document.body.innerHTML = `
    <section>
      <h1>Democracy</h1>
      <p>By <b>Henry Adams</b>.</p>
      <img alt="" src="titlepage.png" />
    </section>`
  const heading = document.querySelector('h1')!
  const author = document.querySelector('p')!
  const image = document.querySelector('img')!
  placeAt(document.querySelector('section')!, 48, 536)
  placeAt(heading, -35164, -34989)
  placeAt(author, -17582, -17457)
  placeAt(document.querySelector('b')!, -17560, -17470)
  placeAt(image, 96, 488)
  return { heading, author, image }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
})

describe('pullInOffPage', () => {
  it('hides text placed wholly before the page on the page itself, for screen readers', () => {
    const { heading } = titlePage()

    expect(pullInOffPage(document)).toBe(2)

    expect(heading.style.getPropertyValue('left')).toBe('auto')
    expect(heading.style.getPropertyPriority('left')).toBe('important')
    expect(heading.style.getPropertyValue('clip-path')).toBe('inset(50%)')
    expect(heading.textContent).toBe('Democracy')
  })

  it('leaves the text on the page alone', () => {
    const { image } = titlePage()

    pullInOffPage(document)

    expect(image.getAttribute('style')).toBeNull()
    expect(document.querySelector('section')!.getAttribute('style')).toBeNull()
  })

  it('moves only the outermost element, because its children move with it', () => {
    titlePage()

    pullInOffPage(document)

    expect(document.querySelector('b')!.getAttribute('style')).toBeNull()
  })

  it('leaves an element that only starts before the page', () => {
    document.body.innerHTML = '<p>A hanging quotation mark</p>'
    const line = document.querySelector('p')!
    placeAt(line, -8, 400)

    expect(pullInOffPage(document)).toBe(0)
    expect(line.getAttribute('style')).toBeNull()
  })

  it('leaves a right-to-left book alone, where text before the page is real text', () => {
    const { heading } = titlePage()
    document.body.style.direction = 'rtl'

    expect(pullInOffPage(document)).toBe(0)
    expect(heading.getAttribute('style')).toBeNull()
  })

  it('leaves a book written top to bottom alone', () => {
    const { heading } = titlePage()
    document.body.style.writingMode = 'vertical-rl'

    expect(pullInOffPage(document)).toBe(0)
    expect(heading.getAttribute('style')).toBeNull()
  })
})
