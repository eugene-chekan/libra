/** Every route path in the client, in one place. */
export const routes = {
  login: '/login',
  library: '/library',
  shelves: '/shelves',
  chat: '/chat',
  /** One book. */
  book: '/books/:id',
  /** The reader, which milestone 12 (#36) builds. */
  reader: '/books/:id/read',
} as const

/** The address of one book's detail screen. */
export function bookPath(id: number): string {
  return `/books/${id}`
}

/** Where the Read button goes. */
export function readerPath(id: number): string {
  return `/books/${id}/read`
}

/** Primary navigation, in the order the sidebar shows it. */
export const primaryNav = [
  { to: routes.library, label: 'Library', icon: 'grid' },
  { to: routes.shelves, label: 'Shelves', icon: 'shelves' },
  { to: routes.chat, label: 'Librarian', icon: 'message-square' },
] as const
