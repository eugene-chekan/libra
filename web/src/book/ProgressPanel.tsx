import styles from './ProgressPanel.module.css'

interface ProgressPanelProps {
  /** 0 to 1. */
  progress: number
  /** The book's page count, or null when the file never declared one. */
  pages: number | null
}

/** How far through the book this reader is. */
export function ProgressPanel({ progress, pages }: ProgressPanelProps) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100)

  return (
    <section className={styles.panel} aria-labelledby="reading-progress-label">
      <h2 className={styles.label} id="reading-progress-label">
        Reading Progress
      </h2>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.readout}>
        <span className={styles.pages}>
          {pages === null
            ? percent === 0
              ? 'Not started'
              : 'Read so far'
            : `${Math.round((percent / 100) * pages)} of ${pages} pages`}
        </span>
        <span className={styles.percent}>{percent}%</span>
      </div>
    </section>
  )
}
