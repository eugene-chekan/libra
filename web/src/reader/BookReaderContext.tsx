import { createContext, useContext, type ReactNode } from 'react'

import type { BookReader } from './BookReader'

const BookReaderContext = createContext<BookReader | null>(null)

/** Hands one book reader to the screen below it. */
export function BookReaderProvider({
  reader,
  children,
}: {
  reader: BookReader
  children: ReactNode
}) {
  return <BookReaderContext value={reader}>{children}</BookReaderContext>
}

/** The book reader. */
export function useBookReader(): BookReader {
  const reader = useContext(BookReaderContext)
  if (!reader) throw new Error('useBookReader must be used inside a BookReaderProvider')
  return reader
}
