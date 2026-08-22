/**
 * Every route path in the client, in one place.
 *
 * Imported rather than transcribed. A path typed out again in a test or a link
 * is a second copy that will drift, and the rule in docs/specs/code-style.md
 * is explicit: tests import constants, they never transcribe them.
 *
 * These are real paths, not `#` fragments. That is why every endpoint lives
 * under `/api` — without the prefix, reloading at `/shelves` would ask the
 * server for `/shelves` and get the shelf list as JSON instead of the app.
 * See docs/specs/client-stack.md.
 */
export const routes = {
  login: '/login',
  library: '/library',
  shelves: '/shelves',
  chat: '/chat',
} as const

/** Primary navigation, in the order the sidebar shows it. */
export const primaryNav = [
  { to: routes.library, label: 'Library', icon: 'grid' },
  { to: routes.shelves, label: 'Shelves', icon: 'shelves' },
  // Added by client-design.md: the handoff's sidebar had no way to reach the
  // librarian, because it was drawn before the agent had a surface.
  { to: routes.chat, label: 'Librarian', icon: 'message-square' },
] as const
