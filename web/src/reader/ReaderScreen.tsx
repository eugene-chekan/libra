import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useBook, useWriteProgress } from '../book/useBook'
import { bookPath } from '../routes'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { AppearanceMenu } from './AppearanceMenu'
import { loadAppearance, saveAppearance } from './appearance'
import { ReaderError, type Appearance, type OpenBook, type ReaderPosition } from './BookReader'
import { useBookReader } from './BookReaderContext'
import { chapterAt } from './chapterAt'
import { ContentsDrawer } from './ContentsDrawer'
import { PageArrows } from './PageArrows'
import { ReaderBar } from './ReaderBar'
import styles from './ReaderScreen.module.css'
import { usePageKeys } from './usePageKeys'

/** How long after the last page turn the new place is worth a request. */
const WRITE_AFTER_MS = 1000

const NOWHERE: ReaderPosition = {
  mark: null,
  index: 0,
  progress: null,
  atStart: true,
  atEnd: false,
}

/** `/books/:id/read` — the whole window, with no application furniture. */
export function ReaderScreen() {
  const { id } = useParams()
  const bookId = Number(id)
  const reader = useBookReader()
  const book = useBook(bookId)
  const host = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState<OpenBook | null>(null)
  const [failure, setFailure] = useState<ReaderError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [panel, setPanel] = useState<'contents' | 'appearance' | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance)
  const [position, setPosition] = useState<ReaderPosition>(NOWHERE)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumed = useRef(false)

  const { mutate: writeProgress } = useWriteProgress(bookId)
  const savedMark = book.data?.position ?? null
  const savedProgress = book.data?.progress ?? 0

  useEffect(() => {
    const mount = host.current
    if (!mount || !book.isSuccess) return
    let cancelled = false
    resumed.current = false

    reader
      .open(bookId, mount)
      .then((opened) => {
        if (!cancelled) setOpen(opened)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setFailure(
          error instanceof ReaderError
            ? error
            : new ReaderError('parse', 'This book could not be opened.')
        )
      })

    return () => {
      cancelled = true
      reader.destroy()
    }
  }, [reader, bookId, attempt, book.isSuccess])

  // Resuming happens once, and never writes anything. An address goes back exactly. A
  // percentage is best effort, and only for a book stored before addresses were kept.
  useEffect(() => {
    if (!open || resumed.current) return
    resumed.current = true
    if (savedMark !== null) void reader.goTo(savedMark)
    else if (savedProgress > 0) void reader.goToProgress(savedProgress)
  }, [open, savedMark, savedProgress, reader])

  useEffect(() => {
    if (open) reader.setAppearance(appearance)
  }, [reader, open, appearance])

  useEffect(() => {
    if (!open) return
    return reader.onMove(setPosition)
  }, [open, reader])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  /**
   * The one write rule: turning a page saves where the turn landed, a second after the last
   * one. Opening a book is not turning a page, so a resume can never overwrite the place it is
   * restoring. The last page finishes the book, which is what stamps `finished_at`.
   */
  const save = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const now = reader.position()
      writeProgress({ progress: now.atEnd ? 1 : now.progress, position: now.mark })
    }, WRITE_AFTER_MS)
  }, [reader, writeProgress])

  const turn = useCallback(
    (move: () => Promise<void>) => {
      void move().then(save)
    },
    [save]
  )

  const goNext = useCallback(() => turn(() => reader.next()), [turn, reader])
  const goPrevious = useCallback(() => turn(() => reader.previous()), [turn, reader])
  usePageKeys(goPrevious, goNext, open !== null && panel === null)

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const title = open?.title ?? book.data?.title ?? 'Book'

  function chooseChapter(index: number) {
    turn(() => reader.goToChapter(index))
    setPanel(null)
  }

  function chooseAppearance(next: Appearance) {
    setAppearance(next)
    saveAppearance(next)
  }

  return (
    <div className={styles.screen}>
      <ReaderBar
        title={title}
        chapter={chapterAt(open?.chapters ?? [], position.index)}
        progress={position.progress}
        backTo={bookPath(bookId)}
        onContents={() => setPanel('contents')}
        onAppearance={() => setPanel('appearance')}
      />
      {panel === 'contents' && (
        <ContentsDrawer
          chapters={open?.chapters ?? []}
          currentIndex={position.index}
          onChoose={chooseChapter}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'appearance' && (
        <AppearanceMenu
          value={appearance}
          onChange={chooseAppearance}
          onClose={() => setPanel(null)}
        />
      )}
      <div className={styles.body}>
        {/*
          Never hidden while opening. epub.js measures this element to size the page it renders
          inside, and a `display: none` box measures zero — which produced a reader that had
          loaded the whole book and drew none of it. The overlay covers it instead.
        */}
        <div
          ref={host}
          className={`${styles.page} ${styles[appearance.width]}`}
          role="region"
          aria-label={title}
          aria-busy={open === null}
          hidden={failure !== null}
        />
        {open !== null && failure === null && (
          <PageArrows
            atStart={position.atStart}
            atEnd={position.atEnd}
            onPrevious={goPrevious}
            onNext={goNext}
          />
        )}
        {(failure !== null || open === null) && (
          <div className={styles.overlay}>
            <div className={styles.overlayColumn}>
              {failure ? (
                <ErrorBlock
                  message={failure.message}
                  onRetry={failure.kind === 'download' ? retry : undefined}
                  action={
                    failure.kind === 'parse' ? (
                      <Link className={styles.backLink} to={bookPath(bookId)}>
                        Back to the book
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <OpeningSkeleton />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Prose-shaped placeholder lines, and after two seconds a word about why. */
function OpeningSkeleton() {
  const [visible, setVisible] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 200)
    const nag = setTimeout(() => setSlow(true), 2000)
    return () => {
      clearTimeout(show)
      clearTimeout(nag)
    }
  }, [])

  if (!visible) return null
  return (
    <div>
      {[92, 100, 96, 88, 100, 70].map((width, index) => (
        <div key={index} className={styles.skeletonLine} style={{ width: `${width}%` }} />
      ))}
      {slow && <p className={styles.slowNote}>Downloading the book. Large books take a moment.</p>}
    </div>
  )
}
