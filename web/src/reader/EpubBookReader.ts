import ePub, { type Book, type NavItem, type Rendition } from 'epubjs'

import type { LibraApi } from '../api/LibraApi'
import { loadLocations, saveLocations } from './locationsCache'
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
 * Characters between one measured position and the next. Smaller is more precise and takes
 * longer to measure; epub.js's own examples use this figure, and on a novel it puts a mark
 * roughly every screenful.
 */
const CHARS_PER_LOCATION = 1000

/** epub.js over the whole archive, fetched once and parsed in the browser. */
export class EpubBookReader implements BookReader {
  private book: Book | null = null
  private host: HTMLElement | null = null
  private rendition: Rendition | null = null
  private chapterCount = 0
  private listeners: ((position: ReaderPosition) => void)[] = []
  private onScroll: (() => void) | null = null
  private frame: number | null = null
  private last: ReaderPosition | null = null
  private measured: Promise<void> = Promise.resolve()

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

    // Captured on the host rather than bound to epub.js's scrolling element. That element is
    // created and sized as the chapter lays out, so looking for it here finds nothing on a
    // slow machine and leaves the listener on something that never scrolls — progress then
    // only moved when the chapter did. Scroll events do not bubble, but they do capture.
    this.host = host
    this.onScroll = () => this.announce()
    host.addEventListener('scroll', this.onScroll, { capture: true, passive: true })

    this.measured = this.measure(book, bookId, bytes.byteLength)

    return {
      title: book.packaging.metadata.title,
      chapters: this.tableOfContents(book),
    }
  }

  async goTo(progress: number): Promise<void> {
    const rendition = this.rendition
    const book = this.book
    if (!rendition || !book) throw new Error('The book is not open')

    // Resuming is the one place exactness is the whole point, so it waits to be measured
    // rather than landing near the right chapter and calling it close enough.
    await this.measured
    const cfi = book.locations.cfiFromPercentage(Math.min(1, Math.max(0, progress)))
    if (cfi) await rendition.display(cfi)
  }

  async goToChapter(index: number): Promise<void> {
    const rendition = this.rendition
    if (!rendition) throw new Error('The book is not open')

    // By href, not by spine number. The continuous manager accepts a number and quietly does
    // nothing with it; the section's own address is the target it acts on.
    const href = this.book?.spine.get(index)?.href
    await (href ? rendition.display(href) : rendition.display(index))
  }

  position(): ReaderPosition {
    const rendition = this.rendition
    if (!rendition) return { progress: 0, index: 0 }

    // The typings overload `currentLocation` as both sync and a promise, and describe the
    // resolved value as a DisplayedLocation. What comes back is a Location, whose `start` is
    // undefined until the first `relocated`.
    const location = rendition.currentLocation() as unknown as
      { start?: { index?: number; cfi?: string } } | undefined
    const index = location?.start?.index ?? 0

    return { index, progress: this.progressAt(location?.start?.cfi, index) }
  }

  /**
   * How far through the text the reader is. Until the book has been measured there is nothing
   * to be exact with, so it falls back to counting chapters — the rough answer this used to
   * give always, and now gives only for the second or so before the measuring finishes.
   */
  private progressAt(cfi: string | undefined, index: number): number {
    const book = this.book
    if (book && cfi && book.locations.length()) {
      const measured = book.locations.percentageFromCfi(cfi)
      if (typeof measured === 'number' && !Number.isNaN(measured)) {
        return Math.min(1, Math.max(0, measured))
      }
    }
    return this.chapterCount > 0 ? Math.min(1, index / this.chapterCount) : 0
  }

  /** Measures the book, reusing the last measurement of the same file when there is one. */
  private async measure(book: Book, bookId: number, byteLength: number): Promise<void> {
    const cached = loadLocations(bookId, byteLength)
    if (cached) {
      book.locations.load(cached)
      return
    }
    await book.locations.generate(CHARS_PER_LOCATION)
    saveLocations(bookId, byteLength, book.locations.save())
    this.announce()
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
    if (this.host && this.onScroll) {
      this.host.removeEventListener('scroll', this.onScroll, { capture: true })
    }
    this.listeners = []
    this.onScroll = null
    this.host = null
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
        Math.abs(this.last.progress - position.progress) < 0.0005
      if (unchanged) return
      this.last = position
      for (const listener of this.listeners) listener(position)
    })
  }
}
