import { Link } from 'react-router-dom'

import type { Book } from '../api/types'
import { bookPath } from '../routes'
import { BookCover } from './BookCover'
import { BookStatusLine } from './BookStatusLine'
import styles from './BookCard.module.css'

/**
 * One cell of the library grid: cover, title, author, status line.
 *
 * The whole cell is one link to the book, rather than the title alone. The
 * cover is the thing a reader aims at, and a link that covers what it looks
 * like it covers needs no explaining. It is a real `<a>`, so the address can
 * be opened in a new tab, copied, or bookmarked.
 */
export function BookCard({ book }: { book: Book }) {
  return (
    <Link className={styles.cell} to={bookPath(book.id)}>
      <BookCover id={book.id} title={book.title} hasCover={book.has_cover} />
      <div>
        <p className={styles.title}>{book.title}</p>
        <p className={styles.author}>{book.author}</p>
        <BookStatusLine progress={book.progress} rating={book.rating} />
      </div>
    </Link>
  )
}
