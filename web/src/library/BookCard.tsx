import { Link } from 'react-router-dom'

import type { Book } from '../api/types'
import { bookPath } from '../routes'
import { CoverTooltip } from '../widgets/CoverTooltip'
import { BookCover } from './BookCover'
import { BookStatusLine } from './BookStatusLine'
import styles from './BookCard.module.css'

/** One cell of the library grid: cover, title, author, status line. */
export function BookCard({ book }: { book: Book }) {
  return (
    <Link className={styles.cell} to={bookPath(book.id)}>
      {/* The title below is cut at two lines. The tooltip is where a long one can be read. */}
      <CoverTooltip title={book.title} author={book.author}>
        <BookCover id={book.id} title={book.title} hasCover={book.has_cover} />
      </CoverTooltip>
      <div>
        <p className={styles.title}>{book.title}</p>
        <p className={styles.author}>{book.author}</p>
        <BookStatusLine progress={book.progress} rating={book.rating} />
      </div>
    </Link>
  )
}
