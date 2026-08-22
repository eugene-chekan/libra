import { useSearchParams } from 'react-router-dom'

import { messageFor } from '../api/errors'
import { BookCard } from '../library/BookCard'
import { FilterSummary } from '../library/FilterSummary'
import { mergedTagIds, parseSearchInput } from '../library/filterParams'
import { SearchBar } from '../library/SearchBar'
import { useBooks } from '../library/useBooks'
import { useShelves } from '../library/useShelves'
import { useTags } from '../library/useTags'
import styles from '../shell/AppShell.module.css'
import { EmptyState } from '../widgets/EmptyState'
import { ErrorBlock } from '../widgets/ErrorBlock'
import { SkeletonDelay, SkeletonGrid } from '../widgets/Skeleton'
import gridStyles from './LibraryScreen.module.css'

/**
 * `/library`. Holds no filter state of its own — the URL is the one source
 * of truth, per client-design.md: a filtered view is then linkable, survives
 * a reload, and comes back with the back button. `q` carries the raw search
 * box text (bare words and `#tag` tokens together, exactly as typed); `tags`
 * carries only the sidebar's own selections. The two are merged into one id
 * list here, the same way `GET /books` expects it.
 */
export function LibraryScreen() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawQuery = searchParams.get('q') ?? ''
  const shelfParam = searchParams.get('shelf')
  const shelfId = shelfParam ? Number(shelfParam) : undefined
  const sidebarTagIds = (searchParams.get('tags') ?? '').split(',').filter(Boolean).map(Number)

  const tagsQuery = useTags()
  const shelvesQuery = useShelves()
  const allTags = tagsQuery.data ?? []

  const { textQuery, hashTagNames } = parseSearchInput(rawQuery)
  const tagIds = mergedTagIds({ hashTagNames, sidebarTagIds, allTags })

  const books = useBooks({
    q: textQuery || undefined,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
    shelfId,
  })

  const activeShelf = shelvesQuery.data?.find((shelf) => shelf.id === shelfId) ?? null
  const activeTags = tagIds
    .map((id) => allTags.find((tag) => tag.id === id))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)

  function setRawQuery(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next) params.set('q', next)
        else params.delete('q')
        return params
      },
      { replace: true }
    )
  }

  const hasActiveFilter =
    rawQuery.trim() !== '' || shelfId !== undefined || sidebarTagIds.length > 0

  return (
    <>
      <div className={gridStyles.headerRow}>
        <h1 className={styles.pageTitle}>Library</h1>
        {books.data && <span className={gridStyles.count}>{books.data.total} books</span>}
      </div>

      <SearchBar
        value={rawQuery}
        onChange={setRawQuery}
        tags={allTags}
        activeHashTagNames={sidebarTagIds
          .map((id) => allTags.find((tag) => tag.id === id)?.name.toLowerCase())
          .filter((name): name is string => name !== undefined)}
      />

      <FilterSummary shelf={activeShelf} tags={activeTags} />

      {books.isPending && (
        <SkeletonDelay>
          <SkeletonGrid />
        </SkeletonDelay>
      )}

      {books.isError && (
        <ErrorBlock message={messageFor(books.error)} onRetry={() => books.refetch()} />
      )}

      {books.isSuccess && books.data.total === 0 && hasActiveFilter && (
        <p className={gridStyles.searchEmpty}>No books match your search.</p>
      )}

      {books.isSuccess && books.data.total === 0 && !hasActiveFilter && (
        <EmptyState title="Your library is empty" hint="Upload a book to add your first one." />
      )}

      {books.isSuccess && books.data.total > 0 && (
        <div className={gridStyles.grid}>
          {books.data.items.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </>
  )
}
