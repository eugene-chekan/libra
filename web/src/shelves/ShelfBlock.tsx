import { Link } from 'react-router-dom'

import type { Shelf } from '../api/types'
import { BookCover } from '../library/BookCover'
import { useBooks } from '../library/useBooks'
import { bookPath, routes } from '../routes'
import { CoverTooltip } from '../widgets/CoverTooltip'
import hidden from '../widgets/visuallyHidden.module.css'
import { PublicPill } from './PublicPill'
import styles from './ShelfBlock.module.css'

/** One shelf on the Shelves page: its name, how many books, and a row of them. */
export function ShelfBlock({ shelf }: { shelf: Shelf }) {
  const books = useBooks({ shelfId: shelf.id })
  const filtered = `${routes.library}?shelf=${shelf.id}`

  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>
        <Link className={styles.name} to={filtered}>
          {shelf.name}
        </Link>
        {/* Whose shelf this is, and only when it is not the reader's own.
            Labelling your own shelves with your own name would be noise. */}
        {!shelf.editable && shelf.owner_username && (
          <span className={styles.owner}>· by {shelf.owner_username}</span>
        )}
        {shelf.visibility === 'public' && <PublicPill />}
        <span className={styles.count}>
          {shelf.book_count} {shelf.book_count === 1 ? 'book' : 'books'}
        </span>
      </h2>

      {books.isSuccess && books.data.items.length === 0 && (
        <p className={styles.empty}>Nothing on this shelf yet.</p>
      )}

      {books.isSuccess && books.data.items.length > 0 && (
        <ul className={styles.covers}>
          {books.data.items.map((book) => (
            <li key={book.id}>
              <Link className={styles.cover} to={bookPath(book.id)}>
                <CoverTooltip title={book.title} author={book.author}>
                  <BookCover id={book.id} title={book.title} hasCover={book.has_cover} />
                </CoverTooltip>
                {/* The cover is a picture; the link still needs words. Visible
                    text would repeat the title under every cover in a row that
                    is meant to be scanned, so it is read out rather than drawn. */}
                <span className={hidden.visuallyHidden}>
                  {book.title} by {book.author}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {books.isError && <p className={styles.empty}>Could not load these books.</p>}
    </section>
  )
}
