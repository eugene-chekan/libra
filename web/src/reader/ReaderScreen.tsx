import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useBook, useWriteProgress } from '../book/useBook'
import { bookPath } from '../routes'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { AppearanceMenu } from './AppearanceMenu'
import { loadAppearance, saveAppearance } from './appearance'
import { ReaderError, type Appearance, type OpenBook, type ReaderPosition } from './BookReader'
import { useIsPhone } from '../shell/useIsPhone'
import { useBookReader } from './BookReaderContext'
import { chapterAt } from './chapterAt'
import { ContentsDrawer } from './ContentsDrawer'
import { PageArrows } from './PageArrows'
import { ReaderBar } from './ReaderBar'
import styles from './ReaderScreen.module.css'
import { ReturnToPlace } from './ReturnToPlace'
import { usePageKeys } from './usePageKeys'

/** How long after the last page turn the new place is worth a request. */
const WRITE_AFTER_MS = 1000

const NOWHERE: ReaderPosition = {
  mark: null,
  index: 0,
  progress: null,
  pages: null,
  atStart: true,
  atEnd: false,
}

/** How much of each edge turns a page. A third either side, leaving the middle alone. */
const TAP_ZONE = 1 / 3

/** `/books/:id/read` — the whole window, with no application furniture. */
export function ReaderScreen() {
  const { id } = useParams()
  const bookId = Number(id)
  const reader = useBookReader()
  const isPhone = useIsPhone()
  const book = useBook(bookId)
  const host = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState<OpenBook | null>(null)
  const [failure, setFailure] = useState<ReaderError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [panel, setPanel] = useState<'contents' | 'appearance' | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance)
  const [position, setPosition] = useState<ReaderPosition>(NOWHERE)
  /** The page a link inside the book left, while the reader is still away from it. */
  const [returnTo, setReturnTo] = useState<ReaderPosition | null>(null)
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

  /** Stores one place. The last page finishes the book, which stamps `finished_at`. */
  const write = useCallback(
    (at: ReaderPosition) =>
      writeProgress({ progress: at.atEnd ? 1 : at.progress, position: at.mark }),
    [writeProgress]
  )

  /**
   * The one write rule: a move the reader makes saves where it landed, a second after the last
   * one. Opening a book is not such a move, so a resume can never overwrite the place it is
   * restoring, and neither is a page turned while a link has taken the reader away.
   */
  const save = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      write(reader.position())
    }, WRITE_AFTER_MS)
  }, [reader, write])

  // A second link keeps the first way back, so a note that links on still returns to the page
  // the reading was on. A save still waiting from a turn just before the link was meant for the
  // page the link leaves, so that page is written now.
  useEffect(() => {
    if (!open) return
    return reader.onLinkFollowed((from) => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
        write(from)
      }
      setReturnTo((kept) => kept ?? from)
    })
  }, [open, reader, write])

  const moveAndSave = useCallback(
    (move: () => Promise<void>) => {
      void move().then(save)
    },
    [save]
  )

  // While a link has taken the reader away, turning pages saves nothing, so the book still opens
  // at the page they left.
  const turn = useCallback(
    (move: () => Promise<void>) => {
      if (returnTo === null) moveAndSave(move)
      else void move()
    },
    [moveAndSave, returnTo]
  )

  const goNext = useCallback(() => turn(() => reader.next()), [turn, reader])
  const goPrevious = useCallback(() => turn(() => reader.previous()), [turn, reader])
  usePageKeys(goPrevious, goNext, open !== null && panel === null)

  // Tap the outer thirds to turn a page. Phone only: a mouse has the arrows and the keyboard,
  // and clicking the text to turn there would be a surprise rather than a shortcut. The middle
  // third is left alone because that is where a thumb rests and where a menu is dismissed.
  useEffect(() => {
    if (!isPhone || !open || panel !== null) return
    return reader.onTap((fraction) => {
      if (fraction < TAP_ZONE) goPrevious()
      else if (fraction > 1 - TAP_ZONE) goNext()
    })
  }, [isPhone, open, panel, reader, goPrevious, goNext])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const title = open?.title ?? book.data?.title ?? 'Book'

  function chooseChapter(index: number) {
    setReturnTo(null)
    moveAndSave(() => reader.goToChapter(index))
    setPanel(null)
  }

  function goBackToPlace() {
    const mark = returnTo?.mark
    setReturnTo(null)
    if (mark) moveAndSave(() => reader.goTo(mark))
  }

  function stayHere() {
    setReturnTo(null)
    save()
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
        pages={position.pages}
        progress={position.progress}
        backTo={bookPath(bookId)}
        onContents={() => setPanel('contents')}
        onAppearance={() => setPanel('appearance')}
        pageTurns={
          isPhone && open !== null && failure === null
            ? {
                atStart: position.atStart,
                atEnd: position.atEnd,
                onPrevious: goPrevious,
                onNext: goNext,
              }
            : null
        }
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
        {open !== null && failure === null && !isPhone && (
          <PageArrows
            atStart={position.atStart}
            atEnd={position.atEnd}
            onPrevious={goPrevious}
            onNext={goNext}
          />
        )}
        {open !== null && failure === null && returnTo !== null && (
          <ReturnToPlace pages={returnTo.pages} onReturn={goBackToPlace} onStay={stayHere} />
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
