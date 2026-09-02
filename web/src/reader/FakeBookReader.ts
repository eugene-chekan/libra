import {
  ReaderError,
  type BookReader,
  type Chapter,
  type OpenBook,
  type ReaderPosition,
  type TextSize,
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
  textSize: TextSize = 'medium'
  destroyed = false

  private readonly options: FakeOptions
  private readonly chapters: Chapter[]
  private readonly spineLength: number
  private current: ReaderPosition = { index: 0, fraction: 0 }
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
      chapterCount: this.spineLength,
    })
  }

  goTo(position: ReaderPosition): Promise<void> {
    if (position.index < 0 || position.index >= this.spineLength) {
      return Promise.reject(new RangeError(`No chapter ${position.index}`))
    }
    this.calls.push(`goTo:${position.index}`)
    this.current = position
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

  setTextSize(size: TextSize): void {
    this.textSize = size
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
