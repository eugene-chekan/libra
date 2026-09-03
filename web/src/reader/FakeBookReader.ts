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

interface FakeOptions {
  /** Makes `open` reject, so the screen's two error shapes can both be tested. */
  failWith?: 'download' | 'parse'
  title?: string
  chapters?: Chapter[]
  /** Spine length, which is larger than the contents on any real book. */
  chapterCount?: number
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
   * Resuming lands where it is told. The real one has to measure the book first and rounds to
   * the nearest position it marked, so a caller must not assume it comes back exactly.
   */
  goTo(progress: number): Promise<void> {
    if (progress < 0 || progress > 1) {
      return Promise.reject(new RangeError(`Progress out of range: ${progress}`))
    }
    this.calls.push(`goTo:${progress.toFixed(2)}`)
    this.current = { ...this.current, progress }
    return Promise.resolve()
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
