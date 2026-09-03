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

/** Where the reader is in the book. */
export interface ReaderPosition {
  /**
   * How far through the book, 0 to 1, measured by how much text is behind the reader rather
   * than by how many chapters are. Counting chapters weighs a two-paragraph title page the
   * same as a forty-page chapter, which made the number move in jumps that had nothing to do
   * with how much had been read.
   */
  progress: number
  /** Which spine item is on screen, for marking the contents. */
  index: number
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
  /**
   * Go to a fraction of the way through the book — resuming. Exact rather than approximate,
   * so this waits for whatever measuring the book needs before it can land in the right place.
   */
  goTo(progress: number): Promise<void>
  /** Go to the start of a spine item — choosing from the contents. */
  goToChapter(index: number): Promise<void>
  /** Where the reader is now. */
  position(): ReaderPosition
  /** Watch for the position changing because the reader scrolled. Returns an unsubscribe. */
  onMove(listener: (position: ReaderPosition) => void): () => void
  /** Text size and measure, applied to the chapter documents themselves. */
  setAppearance(appearance: Appearance): void
  /** Release the book and its iframe. */
  destroy(): void
}
