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
import { loadLocations, saveLocations } from './locationsCache'

const FONT_SIZES: Record<TextSize, string> = {
  small: '95%',
  medium: '110%',
  large: '130%',
}

/**
 * How wide the reading area runs. epub.js works its column widths out from the box it is given,
 * so this is set on that box rather than inside the book — fighting the engine for the same
 * property is what made the old reader's text jam against the left edge.
 */
const WIDTHS: Record<ReadingWidth, string> = {
  narrow: '46em',
  medium: '62em',
  wide: '84em',
}

/**
 * Warm near-black rather than pure black, the way ink sits on paper. The same value as the
 * app's `text` token, written out because this is injected into the book's own document, where
 * the application's custom properties do not reach.
 */
const PAPER_INK = '#2a2520'

/**
 * Characters between one measured position and the next. epub.js's own examples use this
 * figure. The measurement feeds the percentage on the bar and nothing else.
 */
const CHARS_PER_LOCATION = 1000

const NOWHERE: ReaderPosition = {
  mark: null,
  index: 0,
  progress: null,
  atStart: true,
  atEnd: false,
}

/**
 * What epub.js hands to `relocated`. Its typings call `atStart` and `atEnd` booleans, but it
 * only ever sets them to true, so they arrive undefined the rest of the time.
 */
interface RelocatedLocation {
  start?: { index?: number; cfi?: string }
  atStart?: boolean
  atEnd?: boolean
}

/** epub.js over the whole archive, fetched once and parsed in the browser. */
export class EpubBookReader implements BookReader {
  private book: Book | null = null
  private rendition: Rendition | null = null
  private host: HTMLElement | null = null
  private listeners: ((position: ReaderPosition) => void)[] = []
  private current: ReaderPosition = NOWHERE
  private measured: Promise<boolean> = Promise.resolve(false)
  private isMeasured = false

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
    this.host = host

    // Paginated, with epub.js's default manager. The continuous one reaches a target with
    // `scrollBy` — a move relative to wherever the reader already was — and loads sections in
    // and out underneath it, so the same address landed somewhere different on every open.
    // This one uses `scrollTo`, an absolute position snapped to a page edge.
    const rendition = book.renderTo(host, {
      flow: 'paginated',
      spread: 'auto',
      width: '100%',
      height: '100%',
    })
    this.rendition = rendition
    rendition.on('relocated', (location: RelocatedLocation) => this.report(location))
    await rendition.display()

    this.measured = this.measure(book, bookId, bytes.byteLength)

    return {
      title: book.packaging.metadata.title,
      chapters: this.tableOfContents(book),
    }
  }

  async goTo(mark: string): Promise<void> {
    await this.rendition?.display(mark)
  }

  async goToProgress(progress: number): Promise<void> {
    const book = this.book
    if (!book || !(await this.measured)) return

    const cfi = book.locations.cfiFromPercentage(Math.min(1, Math.max(0, progress)))
    // An unmeasured book answers with the number -1 rather than an address, and -1 is truthy.
    if (typeof cfi !== 'string') return
    await this.rendition?.display(cfi)
  }

  async goToChapter(index: number): Promise<void> {
    // By href, not by spine number: a number is accepted and quietly ignored.
    const href = this.book?.spine.get(index)?.href
    if (href) await this.rendition?.display(href)
  }

  async next(): Promise<void> {
    await this.rendition?.next()
  }

  async previous(): Promise<void> {
    await this.rendition?.prev()
  }

  position(): ReaderPosition {
    return this.current
  }

  onMove(listener: (position: ReaderPosition) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((each) => each !== listener)
    }
  }

  setAppearance({ textSize, width }: Appearance): void {
    const rendition = this.rendition
    const host = this.host
    if (!rendition || !host) return

    rendition.themes.fontSize(FONT_SIZES[textSize])
    rendition.themes.default({
      body: {
        color: PAPER_INK,
        'line-height': '1.7',
        'text-align': 'justify',
        hyphens: 'auto',
        '-webkit-hyphens': 'auto',
      },
      // Printed books indent the run of a paragraph and do not space them apart. A book that
      // says otherwise in its own stylesheet still wins: none of this carries `!important`.
      p: {
        'line-height': '1.7',
        'text-align': 'justify',
        'text-indent': '1.4em',
        margin: '0',
      },
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

    host.style.maxWidth = WIDTHS[width]
    // The box changed under it, and epub.js only relayouts when the window itself resizes.
    rendition.resize(host.clientWidth, host.clientHeight)
  }

  destroy(): void {
    this.listeners = []
    this.current = NOWHERE
    this.rendition?.destroy()
    this.book?.destroy()
    this.rendition = null
    this.book = null
    this.host = null
  }

  /** Turns what epub.js reports into what the screen reads, and tells everyone watching. */
  private report(location: RelocatedLocation): void {
    const cfi = location.start?.cfi
    this.current = {
      mark: cfi ?? null,
      index: location.start?.index ?? 0,
      progress: this.progressAt(cfi),
      atStart: location.atStart === true,
      atEnd: location.atEnd === true,
    }
    for (const listener of this.listeners) listener(this.current)
  }

  /** The number for the bar, or null while the book has not been measured. */
  private progressAt(cfi: string | undefined): number | null {
    const book = this.book
    if (!book || !cfi || !this.isMeasured) return null

    const measured = book.locations.percentageFromCfi(cfi)
    if (typeof measured !== 'number' || Number.isNaN(measured)) return null
    return Math.min(1, Math.max(0, measured))
  }

  /**
   * Measures the book so the bar has a number, reusing the last measurement of the same file.
   *
   * Never rejects. A book that cannot be measured still reads; it shows no percentage. This
   * decides nothing about where the reader goes.
   */
  private async measure(book: Book, bookId: number, byteLength: number): Promise<boolean> {
    try {
      const cached = loadLocations(bookId, byteLength)
      if (cached) {
        book.locations.load(cached)
      } else {
        await book.locations.generate(CHARS_PER_LOCATION)
        saveLocations(bookId, byteLength, book.locations.save())
      }
      this.isMeasured = book.locations.length() > 0
    } catch {
      this.isMeasured = false
    }

    // Say where we are again, so the bar picks up the number it could not show before.
    const rendition = this.rendition
    if (this.isMeasured && rendition) {
      this.report(rendition.currentLocation() as unknown as RelocatedLocation)
    }
    return this.isMeasured
  }

  private async download(bookId: number): Promise<ArrayBuffer> {
    let response: Response
    try {
      // `no-cache` revalidates rather than refetches: the ETag makes an unchanged book cheap,
      // and a stale one impossible. Ids are reused after a delete, so the same address can
      // hold a different book, and the browser will otherwise serve the old one.
      response = await fetch(this.api.fileUrl(bookId), {
        credentials: 'include',
        cache: 'no-cache',
      })
    } catch {
      throw new ReaderError('download', 'Could not reach the server.')
    }
    if (response.status === 404) {
      // The catalog row is there and the file is not. Retrying reads the same empty shelf.
      throw new ReaderError('parse', 'This file is missing from the library.')
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
}
