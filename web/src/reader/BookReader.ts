/** One entry in the book's own table of contents. */
export interface Chapter {
  /** Position in the spine, counting from zero. */
  index: number
  /** The label the book gives it. */
  label: string
}

/** Where the reader is in the book. */
export interface ReaderPosition {
  /** Which spine item is on screen. */
  index: number
  /** How far down that item, 0 to 1. */
  fraction: number
}

export type TextSize = 'small' | 'medium' | 'large'

/** What comes back once the archive is parsed. */
export interface OpenBook {
  title: string
  chapters: Chapter[]
  /** Spine length, which is the denominator of the progress formula. */
  chapterCount: number
}

/**
 * Why the book could not be opened, and therefore whether the screen offers a retry.
 * `download` is worth retrying — the network or the session may come back. `parse` never is:
 * the file is unreadable or gone, and the next attempt reads the same thing.
 */
export class ReaderError extends Error {
  readonly kind: 'download' | 'parse'

  constructor(kind: 'download' | 'parse', message: string) {
    super(message)
    this.name = 'ReaderError'
    this.kind = kind
  }
}

/** Everything the reader screen needs from a book. */
export interface BookReader {
  /** Fetch, parse and mount the book into `host`. */
  open(bookId: number, host: HTMLElement): Promise<OpenBook>
  /** Show a position. */
  goTo(position: ReaderPosition): Promise<void>
  /** Where the reader is now. */
  position(): ReaderPosition
  /** Watch for the position changing because the reader scrolled. Returns an unsubscribe. */
  onMove(listener: (position: ReaderPosition) => void): () => void
  setTextSize(size: TextSize): void
  /** Release the book and its iframe. */
  destroy(): void
}
