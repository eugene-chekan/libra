import {
  ReaderError,
  type Appearance,
  type BookReader,
  type Chapter,
  type OpenBook,
  type ReaderPosition,
} from './BookReader'

/**
 * Deliberately shaped like a real book rather than a convenient one: two sections of front
 * matter the contents never mentions, an interlude between chapters, and therefore contents
 * entries whose spine positions are nothing like their positions in the list. A fake where the
 * third entry was the third section is what let a real defect through once.
 */
const CHAPTERS: Chapter[] = [
  { index: 2, label: 'The Beginning', depth: 0 },
  { index: 3, label: 'The Middle', depth: 0 },
  { index: 5, label: 'The End', depth: 0 },
]

/** Pages in the fake book. The last one is the end of it. */
const PAGES = 10

interface FakeOptions {
  /** Makes `open` reject, so the screen's two error shapes can both be tested. */
  failWith?: 'download' | 'parse'
  title?: string
  chapters?: Chapter[]
  /**
   * Holds `goTo` until `finishResume()` is called. Resuming a real book is never instant, and
   * what the screen does in that gap is worth testing.
   */
  slowResume?: boolean
  /** Reports no progress, as a book that has not been measured yet does. */
  unmeasured?: boolean
}

/** A book in memory, standing in for epub.js, which cannot run in jsdom. */
export class FakeBookReader implements BookReader {
  readonly calls: string[] = []
  appearance: Appearance = { textSize: 'medium', width: 'medium' }
  destroyed = false

  private page = 0
  private listeners: ((position: ReaderPosition) => void)[] = []
  private releaseResume: (() => void) | null = null

  constructor(private readonly options: FakeOptions = {}) {}

  open(bookId: number, _host: HTMLElement): Promise<OpenBook> {
    this.calls.push(`open:${bookId}`)
    if (this.options.failWith === 'download') {
      return Promise.reject(new ReaderError('download', 'Could not reach the server.'))
    }
    if (this.options.failWith === 'parse') {
      return Promise.reject(new ReaderError('parse', 'This file is not a readable EPUB.'))
    }
    return Promise.resolve({
      title: this.options.title ?? 'The Locked Door',
      chapters: this.options.chapters ?? CHAPTERS,
    })
  }

  /** Marks name their page, so a test can read back where a resume landed. */
  goTo(mark: string): Promise<void> {
    this.calls.push(`goTo:${mark}`)
    const land = () => this.moveTo(Number(mark.replace('page:', '')))
    if (!this.options.slowResume) {
      land()
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.releaseResume = () => {
        land()
        resolve()
      }
    })
  }

  goToProgress(progress: number): Promise<void> {
    if (progress < 0 || progress > 1) {
      return Promise.reject(new RangeError(`Progress out of range: ${progress}`))
    }
    this.calls.push(`goToProgress:${progress.toFixed(2)}`)
    this.moveTo(Math.round(progress * (PAGES - 1)))
    return Promise.resolve()
  }

  goToChapter(index: number): Promise<void> {
    if (index < 0 || index >= PAGES) {
      return Promise.reject(new RangeError(`No chapter ${index}`))
    }
    this.calls.push(`goToChapter:${index}`)
    this.moveTo(index)
    return Promise.resolve()
  }

  next(): Promise<void> {
    this.calls.push('next')
    this.moveTo(Math.min(PAGES - 1, this.page + 1))
    return Promise.resolve()
  }

  previous(): Promise<void> {
    this.calls.push('previous')
    this.moveTo(Math.max(0, this.page - 1))
    return Promise.resolve()
  }

  position(): ReaderPosition {
    return {
      mark: `page:${this.page}`,
      index: this.page,
      // Never reaches 1, as a real book's measured percentage does not: the last page starts
      // before the end of the text. Only `atEnd` can say the book is finished.
      progress: this.options.unmeasured ? null : this.page / PAGES,
      pages: this.options.unmeasured ? null : { current: this.page + 1, total: PAGES },
      atStart: this.page === 0,
      atEnd: this.page === PAGES - 1,
    }
  }

  onMove(listener: (position: ReaderPosition) => void): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((each) => each !== listener)
    }
  }

  setAppearance(appearance: Appearance): void {
    this.appearance = appearance
  }

  destroy(): void {
    this.destroyed = true
    this.listeners = []
  }

  /** Test-only: let a held `goTo` land, the way measuring the book eventually lets it. */
  finishResume(): void {
    this.releaseResume?.()
    this.releaseResume = null
  }

  private moveTo(page: number): void {
    this.page = page
    // Reported a beat later, as the real one does: epub.js announces a move on its own
    // schedule, after the call that caused it has already returned.
    setTimeout(() => {
      for (const listener of this.listeners) listener(this.position())
    }, 0)
  }
}
