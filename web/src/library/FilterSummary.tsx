import styles from './FilterSummary.module.css'

interface FilterSummaryProps {
  shelf: { id: number; name: string } | null
  tags: { id: number; name: string }[]
}

/**
 * "Filtered by:" — the shelf pill first, then tag pills, matching the order
 * they apply in: the shelf ANDs against everything, the tags OR each other.
 * Styled differently for the same reason: identical-looking pills that
 * behave differently would be worse than no pills, per the issue this
 * builds.
 */
export function FilterSummary({ shelf, tags }: FilterSummaryProps) {
  if (!shelf && tags.length === 0) return null

  return (
    <div className={styles.row}>
      <span className={styles.label}>Filtered by:</span>
      {shelf && (
        <span className={styles.shelfPill} data-testid={`pill-shelf-${shelf.id}`}>
          {shelf.name}
        </span>
      )}
      {tags.map((tag) => (
        <span key={tag.id} className={styles.tagPill} data-testid={`pill-tag-${tag.id}`}>
          {tag.name}
        </span>
      ))}
      {tags.length > 0 && <span className={styles.orHint}>(OR)</span>}
    </div>
  )
}
