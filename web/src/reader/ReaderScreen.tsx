import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useBook, useWriteProgress } from '../book/useBook'
import { bookPath } from '../routes'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { ReaderError, type Appearance, type OpenBook } from './BookReader'
import { useBookReader } from './BookReaderContext'
import { ContentsDrawer } from './ContentsDrawer'
import { ReaderBar } from './ReaderBar'
import { AppearanceMenu } from './AppearanceMenu'
import { loadAppearance, saveAppearance } from './appearance'
import styles from './ReaderScreen.module.css'

/** How long the reader must stop scrolling before the position is worth a request. */
const WRITE_AFTER_MS = 1000

/**
 * How far the reader has to be from where the book put them before the position is worth
 * saving: one displayed percentage point.
 */
const MOVED_BY = 0.01

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
  const [chapterIndex, setChapterIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const pending = useRef<{ progress: number; position: string | null } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumed = useRef(false)
  const restored = useRef(false)
  const resumedTo = useRef(0)
  const landedAt = useRef<number | null>(null)
  const moved = useRef(false)

  const { mutate: writeProgress } = useWriteProgress(bookId)
  const savedProgress = book.data?.progress ?? 0
  const savedMark = book.data?.position ?? null

  useEffect(() => {
    const mount = host.current
    if (!mount || !book.isSuccess) return
    let cancelled = false

    resumed.current = false
    restored.current = false
    moved.current = false
    landedAt.current = null
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

  // Resuming seeks and stops there: the move comes back through `onMove` like any other, so
  // the position and the progress rule follow without this having to set them. It is also why
  // opening no longer depends on the saved progress — that value arrives with the book query,
  // and having it in the deps above reopened the book underneath itself.
  useEffect(() => {
    if (!open || resumed.current) return
    resumed.current = true
    resumedTo.current = savedProgress
    if (savedProgress <= 0 && savedMark === null) {
      restored.current = true
      return
    }
    void reader.goTo({ mark: savedMark, progress: savedProgress }).finally(() => {
      landedAt.current = reader.position().progress
      restored.current = true
    })
  }, [open, savedProgress, savedMark, reader])

  useEffect(() => {
    if (open) reader.setAppearance(appearance)
  }, [reader, open, appearance])

  useEffect(() => {
    if (!open) return

    const flush = () => {
      const latest = pending.current
      if (latest === null) return
      pending.current = null
      writeProgress(latest)
    }

    const stop = reader.onMove((position) => {
      setChapterIndex(position.index)

      // Nothing is written until the book has been put back where the reader left it. Resuming
      // is not instant, and in that gap the reader is sitting at the top — reporting that
      // position wrote a 0 over the stored position it was about to restore.
      if (!restored.current) {
        setProgress(position.progress)
        return
      }

      // Nor is the landing itself the reader moving. Going back to a mark is exact, but a book
      // last read before marks were kept can only be resumed by percentage, and that lands a
      // little short — saving it walked the place one step down the book on every open, 40%
      // then 39.5% then 38.8%, without anybody reading a word. Near where it was sent, or near
      // where it came to rest: either one means the reader has not moved yet.
      const landed = landedAt.current
      const stillWhereItWasPut =
        !moved.current &&
        (Math.abs(position.progress - resumedTo.current) < MOVED_BY ||
          (landed !== null && Math.abs(position.progress - landed) < MOVED_BY))

      // The bar reads the number the book page shows only while the reader really is back
      // where they left off — the resume both landed and landed where it was aimed. When it
      // misses, the bar says where the reader actually is. Saying otherwise painted the stored
      // number over a reader sitting on the cover, which hid the failure instead of showing it.
      const cameBackToThePlace = landed !== null && Math.abs(landed - resumedTo.current) < MOVED_BY
      setProgress(stillWhereItWasPut && cameBackToThePlace ? resumedTo.current : position.progress)
      if (stillWhereItWasPut) return
      moved.current = true

      pending.current = { progress: position.progress, position: position.mark }
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITE_AFTER_MS)
    })

    return () => {
      stop()
      if (timer.current !== null) clearTimeout(timer.current)
      flush()
    }
  }, [open, reader, writeProgress])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const title = open?.title ?? book.data?.title ?? 'Book'

  function chooseChapter(index: number) {
    void reader.goToChapter(index)
    setChapterIndex(index)
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
        progress={progress}
        backTo={bookPath(bookId)}
        onContents={() => setPanel('contents')}
        onAppearance={() => setPanel('appearance')}
      />
      {panel === 'contents' && (
        <ContentsDrawer
          chapters={open?.chapters ?? []}
          currentIndex={chapterIndex}
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
          Never hidden while opening. epub.js measures this element to size the chapter it
          renders inside, and a `display: none` box measures zero — which produced a reader
          that had loaded the whole book and drew none of it. The overlay covers it instead.
        */}
        <div
          ref={host}
          className={styles.page}
          role="region"
          aria-label={title}
          aria-busy={open === null}
          hidden={failure !== null}
        />
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
