/**
 * The one place the phone breakpoint is a number.
 *
 * CSS custom properties cannot be used inside a media query, so the same value
 * is written again in every `@media (max-width: 767px)` rule, each pointing
 * back here. `e2e/shell.spec.ts` checks the two agree by driving the window to
 * either side of the boundary — the layout and the drawer have to change at
 * the same pixel, or a window between the two numbers gets half of each.
 */
export const PHONE_MAX_WIDTH = 767

/** Matches while the window is a phone. */
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`
