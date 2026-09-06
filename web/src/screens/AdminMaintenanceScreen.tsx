import { useState } from 'react'
import { Link } from 'react-router-dom'

import { messageFor } from '../api/errors'
import type { OrphanFile } from '../api/types'
import { formatBytes } from '../maintenance/formatBytes'
import {
  useDeleteOrphan,
  useMaintenance,
  usePruneSessions,
  useVacuum,
} from '../maintenance/useMaintenance'
import { bookPath } from '../routes'
import { ConfirmDialog } from '../widgets/ConfirmDialog'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { Icon } from '../widgets/Icon'
import { SkeletonDelay, SkeletonRows } from '../widgets/Skeleton'
import styles from './AdminMaintenanceScreen.module.css'

/**
 * `/admin/maintenance` — what this installation holds, and what has come loose from it.
 *
 * Everything here is about damage rather than normal use: deleting a book already takes its file
 * and its rows with it. What collects instead is the residue of a crash between writing a file
 * and inserting its row, and of sessions that expire and are then never removed by anything.
 */
export function AdminMaintenanceScreen() {
  const report = useMaintenance()
  const prune = usePruneSessions()
  const vacuum = useVacuum()
  const removeOrphan = useDeleteOrphan()
  const [pendingOrphan, setPendingOrphan] = useState<OrphanFile | null>(null)

  // A route rather than a modal, so it never unmounts to drop a stale error:
  // this tracks only the most recently settled action, as the Users tab does.
  const [error, setError] = useState<Error | null>(null)
  // What the last action did, in words. Both of these change nothing you can see — a pruned
  // session was already refused, and a smaller database file looks identical — so without this
  // the buttons are a guess about whether anything happened at all.
  const [done, setDone] = useState<string | null>(null)

  function announce(said: string) {
    setError(null)
    setDone(said)
  }

  function failed(err: Error) {
    setDone(null)
    setError(err)
  }

  if (report.isPending) {
    return (
      <SkeletonDelay>
        <SkeletonRows rows={4} height="52px" />
      </SkeletonDelay>
    )
  }

  if (report.isError) {
    return <ErrorBlock message={messageFor(report.error)} onRetry={() => void report.refetch()} />
  }

  const { data } = report

  return (
    <>
      <dl className={styles.counts}>
        <Count label="Books" value={data.books} />
        <Count label="Users" value={data.users} />
        <Count label="Shelves" value={data.shelves} />
        <Count label="Tags" value={data.tags} />
        <Count label="Notes" value={data.notes} />
        <Count label="On disk" value={formatBytes(data.library_bytes)} />
      </dl>

      {error && <ErrorBlock message={messageFor(error)} />}
      {done && (
        <p className={styles.done} role="status">
          {done}
        </p>
      )}

      <Section
        title="Expired sessions"
        hint="Signing in creates one; nothing has ever removed them once they lapse. An expired session is already refused, so this only reclaims rows."
      >
        <p className={styles.line}>
          {data.expired_sessions === 0
            ? 'None to clear.'
            : `${data.expired_sessions} ${data.expired_sessions === 1 ? 'session has' : 'sessions have'} expired.`}
        </p>
        {data.expired_sessions > 0 && (
          <button
            type="button"
            className={styles.action}
            disabled={prune.isPending}
            onClick={() =>
              prune.mutate(undefined, {
                onSuccess: (removed) =>
                  announce(`Removed ${removed} ${removed === 1 ? 'session' : 'sessions'}.`),
                onError: failed,
              })
            }
          >
            Prune
          </button>
        )}
      </Section>

      <Section
        title="Files with no book"
        hint="A crash between writing the file and inserting its row leaves one of these. Nothing points at it, so removing it cannot break anything — but it may be the only copy of a book whose row was lost."
      >
        {data.orphan_files.length === 0 ? (
          <p className={styles.line}>Nothing loose on disk.</p>
        ) : (
          <ul className={styles.list}>
            {data.orphan_files.map((file) => (
              <li key={file.name} className={styles.row}>
                <span className={styles.name}>{file.name}</span>
                <span className={styles.detail}>{formatBytes(file.size_bytes)}</span>
                <button
                  type="button"
                  className={styles.destructive}
                  aria-label={`Delete ${file.name}`}
                  onClick={() => setPendingOrphan(file)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Books with no file"
        hint="The other half of the same crash. A reader meets one of these as “this book’s file is missing” when they try to open it."
      >
        {data.missing_files.length === 0 ? (
          <p className={styles.line}>Every book has its file.</p>
        ) : (
          <ul className={styles.list}>
            {data.missing_files.map((book) => (
              <li key={book.id} className={styles.row}>
                <Link className={styles.name} to={bookPath(book.id)}>
                  {book.title}
                </Link>
                <span className={styles.detail}>{book.file_path}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Reclaim space"
        hint="SQLite does not shrink its file when rows are deleted. This asks it to."
      >
        <button
          type="button"
          className={styles.action}
          disabled={vacuum.isPending}
          onClick={() =>
            vacuum.mutate(undefined, {
              onSuccess: (bytes) =>
                announce(bytes > 0 ? `Reclaimed ${formatBytes(bytes)}.` : 'Nothing to reclaim.'),
              onError: failed,
            })
          }
        >
          {vacuum.isPending ? 'Working…' : 'Vacuum'}
        </button>
      </Section>

      {pendingOrphan && (
        <ConfirmDialog
          title={`Delete ${pendingOrphan.name}?`}
          message="The file goes from disk. Nothing in the library points at it, but if it is a book whose row was lost, this is the only copy. This cannot be undone."
          confirmLabel="Delete"
          onClose={() => setPendingOrphan(null)}
          onConfirm={() => {
            removeOrphan.mutate(pendingOrphan.name, {
              onSuccess: () => announce(`Deleted ${pendingOrphan.name}.`),
              onError: failed,
            })
            setPendingOrphan(null)
          }}
        />
      )}
    </>
  )
}

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={styles.count}>
      <dt className={styles.countLabel}>{label}</dt>
      <dd className={styles.countValue}>{value}</dd>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.hint}>{hint}</p>
      {children}
    </section>
  )
}
