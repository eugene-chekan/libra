import ePub, { type Book, type NavItem, type Rendition } from 'epubjs'

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

    // `scrolled` with the continuous manager, not `scrolled-doc`: the latter renders one spine
    // item and stops, so a reader lands on the title page with nowhere to go. Continuous
    // stitches the sections together and loads the next as you reach it, which is what
    // "scrolling, not paginated" was always supposed to mean.
    const rendition = book.renderTo(host, {
      flow: 'scrolled',
      manager: 'continuous',
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

    // By href, not by spine number. The continuous manager accepts a number and quietly does
    // nothing with it; the section's own address is the target it acts on.
    const href = this.book?.spine.get(position.index)?.href
    await (href ? rendition.display(href) : rendition.display(position.index))
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
      // `no-cache` revalidates rather than refetches: the ETag makes an unchanged book cheap,
      // and a stale one impossible. Ids are reused after a delete, so the same address can
      // hold a different book, and the browser will otherwise serve the old one from a
      // heuristically-fresh cache entry without asking.
      response = await fetch(this.api.fileUrl(bookId), {
        credentials: 'include',
        cache: 'no-cache',
      })
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

  /**
   * The book's own contents, flattened and resolved to real spine positions.
   *
   * Two things a naive mapping gets wrong on a real book. Entries nest — parts holding
   * chapters — so only the top level would be listed. And an entry's position in the contents
   * is not its position in the spine: front matter is usually absent from the contents
   * entirely, so the third entry is rarely the third section.
   */
  private tableOfContents(book: Book): Chapter[] {
    const chapters: Chapter[] = []

    const walk = (items: NavItem[], depth: number): void => {
      for (const item of items) {
        const index = this.spineIndexOf(book, item.href)
        if (index !== null) chapters.push({ index, label: item.label.trim(), depth })
        if (item.subitems?.length) walk(item.subitems, depth + 1)
      }
    }

    walk(book.navigation?.toc ?? [], 0)
    return chapters
  }

  /** Where `href` sits in the spine, ignoring any fragment after `#`. */
  private spineIndexOf(book: Book, href: string): number | null {
    try {
      const section = book.spine.get(href.split('#')[0])
      return typeof section?.index === 'number' ? section.index : null
    } catch {
      return null
    }
  }

  private announce(): void {
    const position = this.position()
    for (const listener of this.listeners) listener(position)
  }
}
