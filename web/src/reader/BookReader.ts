/** One entry in the book's own table of contents. */
export interface Chapter {
  /**
   * Position in the spine, counting from zero — where this entry actually points, which is
   * rarely its own position in the contents list.
   */
  index: number
  /** The label the book gives it. */
  label: string
  /** How deeply nested the entry is: 0 for a part, 1 for a chapter inside it. */
  depth: number
}

/** Where the reader is. */
export interface ReaderPosition {
  /**
   * The address of the page on screen, as the engine reports it for the page it rendered.
   * Resuming is built on this and nothing else. Null before the first page arrives.
   */
  mark: string | null
  /** Which spine item, for naming the chapter and marking the contents. */
  index: number
  /**
   * How far through the book, 0 to 1 — for the bar, and never for navigating. Null until the
   * book has been measured, because a number nobody knows yet should not be shown.
   */
  progress: number | null
  /** Whether there is a page before this one, and after it. */
  atStart: boolean
  atEnd: boolean
}

export type TextSize = 'small' | 'medium' | 'large'

export type ReadingWidth = 'narrow' | 'medium' | 'wide'

/** How the reader wants the page to look. Stored per reader, never sent to the server. */
export interface Appearance {
  textSize: TextSize
  width: ReadingWidth
}

/** What comes back once the archive is parsed. */
export interface OpenBook {
  title: string
  chapters: Chapter[]
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
  /** Go back to an address this reader reported earlier. Exact. */
  goTo(mark: string): Promise<void>
  /**
   * Go to a fraction of the way through the book. Best effort, and only for a book stored
   * before addresses were kept: it has to turn the number back into an address, which is the
   * step addresses exist to avoid.
   */
  goToProgress(progress: number): Promise<void>
  /** Go to the start of a spine item — choosing from the contents. */
  goToChapter(index: number): Promise<void>
  /** Turn one page forward, or back. */
  next(): Promise<void>
  previous(): Promise<void>
  /** Where the reader is now. */
  position(): ReaderPosition
  /** Watch the position change. Returns an unsubscribe. */
  onMove(listener: (position: ReaderPosition) => void): () => void
  /** Text size and measure. */
  setAppearance(appearance: Appearance): void
  /** Release the book and its iframe. */
  destroy(): void
}
