import {
  ReaderError,
  type BookReader,
  type Chapter,
  type OpenBook,
  type Appearance,
  type ReaderPosition,
} from './BookReader'

/**
 * Deliberately shaped like a real book rather than a convenient one: two sections of front
 * matter that the contents never mentions, an interlude between chapters, and therefore
 * contents entries whose spine positions are nothing like their positions in the list. A fake
 * where the third entry was the third section is what let a real defect through once.
 */
const CHAPTERS: Chapter[] = [
  { index: 2, label: 'The Beginning', depth: 0 },
  { index: 3, label: 'The Middle', depth: 0 },
  { index: 5, label: 'The End', depth: 0 },
]

const SPINE_LENGTH = 6

/**
 * How far apart the real reader's measured positions are, near enough.
 *
 * Resuming lands on the measured position at or before the one it was asked for, so it always
 * comes back a little short of it. A fake that landed exactly hid a defect that walked a book's
 * saved place a step down the page on every single open.
 */
const MEASURED_STEP = 0.006

interface FakeOptions {
  /** Makes `open` reject, so the screen's two error shapes can both be tested. */
  failWith?: 'download' | 'parse'
  title?: string
  chapters?: Chapter[]
  /** Spine length, which is larger than the contents on any real book. */
  chapterCount?: number
  /**
   * Holds `goTo` until `finishResume()` is called. The real one measures the book before it
   * can land anywhere exact, so resuming is never instant — and what happens in that gap is
   * where the reader used to write a 0 over the position it was about to restore.
   */
  slowResume?: boolean
  /**
   * How far short of the position asked for `goTo` lands, when a measured position is not the
   * answer. On a book whose addresses do not survive rendering the real one places the reader
   * by proportion instead — near the right spot, but further off than usual.
   */
  landShortBy?: number
}

/** A book in memory, standing in for epub.js, which cannot run in jsdom. */
export class FakeBookReader implements BookReader {
  readonly calls: string[] = []
  appearance: Appearance = { textSize: 'medium', width: 'medium' }
  destroyed = false

  private readonly options: FakeOptions
  private readonly chapters: Chapter[]
  private readonly spineLength: number
  private current: ReaderPosition = { index: 0, progress: 0 }
  private listeners: ((position: ReaderPosition) => void)[] = []
  private releaseResume: (() => void) | null = null

  constructor(options: FakeOptions = {}) {
    this.options = options
    this.chapters = options.chapters ?? CHAPTERS
    this.spineLength = options.chapterCount ?? SPINE_LENGTH
  }

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
      chapters: this.chapters,
    })
  }

  /**
   * Resuming lands a little short of where it is told, and says so, exactly as the real one
   * does: it can only land on a position it measured, and it takes the one before.
   */
  goTo(progress: number): Promise<void> {
    if (progress < 0 || progress > 1) {
      return Promise.reject(new RangeError(`Progress out of range: ${progress}`))
    }
    this.calls.push(`goTo:${progress.toFixed(2)}`)

    const land = () => {
      const short = this.options.landShortBy ?? MEASURED_STEP
      this.current = { ...this.current, progress: Math.max(0, progress - short) }
      // Reported a beat later, as the real one does: it reports a move on the next animation
      // frame, so the landing always arrives after the caller has been told resuming is done.
      setTimeout(() => {
        for (const listener of this.listeners) listener(this.current)
      }, 0)
    }
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

  /** Test-only: let a held `goTo` land, the way measuring the book eventually lets it. */
  finishResume(): void {
    this.releaseResume?.()
    this.releaseResume = null
  }

  goToChapter(index: number): Promise<void> {
    if (index < 0 || index >= this.spineLength) {
      return Promise.reject(new RangeError(`No chapter ${index}`))
    }
    this.calls.push(`goToChapter:${index}`)
    this.current = { index, progress: index / this.spineLength }
    return Promise.resolve()
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

  setAppearance(appearance: Appearance): void {
    this.appearance = appearance
  }

  destroy(): void {
    this.destroyed = true
    this.listeners = []
  }

  /** Test-only: pretend the reader scrolled. */
  simulateScroll(position: ReaderPosition): void {
    this.current = position
    for (const listener of this.listeners) listener(position)
  }
}
