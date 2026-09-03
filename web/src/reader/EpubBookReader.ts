import ePub, { type Book, type NavItem, type Rendition } from 'epubjs'

import type { LibraApi } from '../api/LibraApi'
import {
  ReaderError,
  type Appearance,
  type BookReader,
  type Chapter,
  type OpenBook,
  type ReaderPosition,
  type ReadingWidth,
  type TextSize,
} from './BookReader'

const FONT_SIZES: Record<TextSize, string> = {
  small: '95%',
  medium: '110%',
  large: '130%',
}

/**
 * Warm near-black rather than pure black, the way ink sits on paper. The same value as the
 * app's `text` token, written out because this is injected into the book's own document, where
 * the application's custom properties do not reach.
 */
const PAPER_INK = '#2a2520'

/**
 * The measure, in `em`, so it holds its width in characters as the text size changes. The
 * container itself stays the full width of the window — that is what puts the scrollbar at the
 * window's edge rather than beside the column — and the text is centred inside each chapter.
 */
const WIDTHS: Record<ReadingWidth, string> = {
  narrow: '32em',
  medium: '40em',
  wide: '52em',
}

/**
 * How far the reader has scrolled through the chapter now at the top of `scroller`, 0 to 1.
 *
 * Measured against that chapter's own view rather than the scroller as a whole. Continuous flow
 * keeps only the sections near the reader loaded and resizes the scroller as it adds and prunes
 * them, so the scroller's own scroll position says nothing about where in a chapter you are —
 * reading it that way made progress move a whole chapter at a time.
 */
function sectionFraction(scroller: HTMLElement): number {
  const top = scroller.getBoundingClientRect().top
  for (const view of scroller.querySelectorAll('.epub-view')) {
    const box = view.getBoundingClientRect()
    if (box.height > 0 && box.top <= top + 1 && box.bottom > top) {
      return Math.min(1, Math.max(0, (top - box.top) / box.height))
    }
  }
  return 0
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
  private frame: number | null = null
  private last: ReaderPosition | null = null

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
      const view = this.scroller.querySelector('.epub-view')
      if (view) this.scroller.scrollTop += view.getBoundingClientRect().height * position.fraction
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
      fraction: this.scroller ? sectionFraction(this.scroller) : 0,
    }
  }

  onMove(listener: (position: ReaderPosition) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((each) => each !== listener)
    }
  }

  setAppearance({ textSize, width }: Appearance): void {
    const rendition = this.rendition
    if (!rendition) return

    rendition.themes.fontSize(FONT_SIZES[textSize])
    rendition.themes.default({
      // `!important` on the box, because epub.js writes the body's width, margin and padding as
      // an inline style and recomputes them on every resize. Without it the measure applies and
      // the centring does not, which reads as a wide column jammed against the left edge.
      body: {
        'max-width': `${WIDTHS[width]} !important`,
        'margin-left': 'auto !important',
        'margin-right': 'auto !important',
        'padding-left': '24px !important',
        'padding-right': '24px !important',
        // Page margins. In continuous flow this also opens a gap where one chapter ends and
        // the next begins, which is the break a printed book gets from starting a new page.
        'padding-top': '2em !important',
        'padding-bottom': '3em !important',
        // The page colour comes from the container behind, so chapter boundaries leave no seam.
        background: 'transparent',
        color: PAPER_INK,
        'line-height': '1.7',
        'text-align': 'justify',
        hyphens: 'auto',
        '-webkit-hyphens': 'auto',
      },
      // Printed books indent the run of a paragraph and do not space them apart. A book that
      // says otherwise in its own stylesheet still wins: these carry no `!important`.
      p: {
        'line-height': '1.7',
        'text-align': 'justify',
        'text-indent': '1.4em',
        'margin-top': '0',
        'margin-bottom': '0',
      },
      // The first paragraph after a heading or a break starts flush, as it does in print.
      'h1 + p, h2 + p, h3 + p, hr + p, blockquote + p': { 'text-indent': '0' },
      'h1, h2, h3, h4': {
        'line-height': '1.3',
        'margin-top': '1.6em',
        'margin-bottom': '0.8em',
        'text-align': 'left',
        hyphens: 'none',
      },
      img: { 'max-width': '100%', height: 'auto' },
    })
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.last = null
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

  /**
   * Reporting a move is throttled to one animation frame, and dropped when nothing a caller
   * can see has changed. `currentLocation()` walks the rendered views, so calling it on every
   * scroll event — which fires many times a frame — is what made scrolling stutter.
   */
  private announce(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      const position = this.position()
      const unchanged =
        this.last !== null &&
        this.last.index === position.index &&
        Math.abs(this.last.fraction - position.fraction) < 0.001
      if (unchanged) return
      this.last = position
      for (const listener of this.listeners) listener(position)
    })
  }
}
