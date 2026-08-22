import type { Book } from '../api/types'
import { BookCover } from './BookCover'
import { BookStatusLine } from './BookStatusLine'
import styles from './BookCard.module.css'

/** One cell of the library grid: cover, title, author, status line. */
export function BookCard({ book }: { book: Book }) {
  return (
    <div className={styles.cell}>
      <BookCover id={book.id} title={book.title} hasCover={book.has_cover} />
      <div>
        <p className={styles.title}>{book.title}</p>
        <p className={styles.author}>{book.author}</p>
        <BookStatusLine progress={book.progress} rating={book.rating} />
      </div>
    </div>
  )
}
