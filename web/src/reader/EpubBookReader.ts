import ePub, { type Book, type Rendition } from 'epubjs'

import type { LibraApi } from '../api/LibraApi'
import {
  ReaderError,
  type BookReader,
  type Chapter,
  type OpenBook,
  type ReaderPosition,
  type TextSize,
} from './BookReader'

const FONT_SIZES: Record<TextSize, string> = {
  small: '95%',
  medium: '110%',
  large: '130%',
}

/** How far down the scroller `el` is, 0 to 1, treating an unscrollable element as the top. */
function scrollFraction(el: HTMLElement): number {
  const scrollable = el.scrollHeight - el.clientHeight
  return scrollable <= 0 ? 0 : Math.min(1, Math.max(0, el.scrollTop / scrollable))
}

/** The nearest ancestor that actually scrolls, which is where epub.js puts the chapter. */
function scrollerFor(host: HTMLElement): HTMLElement {
  let node: HTMLElement | null = host
  while (node) {
    if (node.scrollHeight - node.clientHeight > 1) return node
    node = node.parentElement
  }
  return host
}

/** epub.js over the whole archive, fetched once and parsed in the browser. */
export class EpubBookReader implements BookReader {
  private book: Book | null = null
  private rendition: Rendition | null = null
  private chapterCount = 0
  private listeners: ((position: ReaderPosition) => void)[] = []
  private onScroll: (() => void) | null = null
  private scroller: HTMLElement | null = null

  constructor(private readonly api: LibraApi) {}

  async open(bookId: number, host: HTMLElement): Promise<OpenBook> {
    const bytes = await this.download(bookId)

    let book: Book
    try {
      book = ePub(bytes)
      await book.ready
    } catch {
      throw new ReaderError('parse', 'This file is not a readable EPUB.')
    }

    this.book = book
    // `spineItems` is real at runtime but missing from epubjs's Spine typings.
    this.chapterCount = (book.spine as unknown as { spineItems: unknown[] }).spineItems.length

    const rendition = book.renderTo(host, {
      flow: 'scrolled-doc',
      width: '100%',
      height: '100%',
    })
    this.rendition = rendition
    await rendition.display()

    rendition.on('relocated', () => this.announce())
    this.scroller = scrollerFor(host)
    this.onScroll = () => this.announce()
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true })

    return {
      title: book.packaging.metadata.title,
      chapters: this.tableOfContents(book),
      chapterCount: this.chapterCount,
    }
  }

  async goTo(position: ReaderPosition): Promise<void> {
    const rendition = this.rendition
    if (!rendition) throw new Error('The book is not open')

    await rendition.display(position.index)
    if (position.fraction > 0 && this.scroller) {
      const scrollable = this.scroller.scrollHeight - this.scroller.clientHeight
      this.scroller.scrollTop = scrollable * position.fraction
    }
  }

  position(): ReaderPosition {
    const rendition = this.rendition
    if (!rendition) return { index: 0, fraction: 0 }

    // The typings overload `currentLocation` as both sync and a promise, and describe the
    // resolved value as a DisplayedLocation. What comes back is a Location, whose `start` is
    // undefined until the first `relocated`.
    const location = rendition.currentLocation() as unknown as
      { start?: { index?: number } } | undefined
    return {
      index: location?.start?.index ?? 0,
      fraction: this.scroller ? scrollFraction(this.scroller) : 0,
    }
  }

  onMove(listener: (position: ReaderPosition) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((each) => each !== listener)
    }
  }

  setTextSize(size: TextSize): void {
    this.rendition?.themes.fontSize(FONT_SIZES[size])
  }

  destroy(): void {
    if (this.scroller && this.onScroll) {
      this.scroller.removeEventListener('scroll', this.onScroll)
    }
    this.listeners = []
    this.onScroll = null
    this.scroller = null
    this.rendition?.destroy()
    this.book?.destroy()
    this.rendition = null
    this.book = null
  }

  private async download(bookId: number): Promise<ArrayBuffer> {
    let response: Response
    try {
      response = await fetch(this.api.fileUrl(bookId), { credentials: 'include' })
    } catch {
      throw new ReaderError('download', 'Could not reach the server.')
    }
    if (response.status === 404) {
      // The catalog row is there and the file is not. Retrying reads the same empty shelf.
      throw new ReaderError('parse', "This book's file is missing from the library.")
    }
    if (!response.ok) {
      throw new ReaderError('download', 'Could not reach the server.')
    }
    return response.arrayBuffer()
  }

  private tableOfContents(book: Book): Chapter[] {
    const toc = book.navigation?.toc ?? []
    return toc.map((entry, index) => ({ index, label: entry.label.trim() }))
  }

  private announce(): void {
    const position = this.position()
    for (const listener of this.listeners) listener(position)
  }
}
