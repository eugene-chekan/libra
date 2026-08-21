/**
 * Durations that JavaScript reads, in milliseconds.
 *
 * The rest of the motion tokens are CSS custom properties in tokens.css,
 * because CSS is what consumes them. These two are timers rather than rules,
 * so this is their one definition — never mirror one into the other, and never
 * retype either into a test. A duration copied into a test in this project had
 * already drifted to 2600 against 2500ms before anyone noticed; the fix is not
 * a tidier comment, it is having one place to import from.
 */

/**
 * Skeletons appear only after this long.
 *
 * On localhost most requests resolve faster, and a skeleton that flashes for
 * 40ms reads as a glitch rather than as feedback.
 */
export const SKELETON_DELAY_MS = 200

/**
 * How long a transient confirmation — "Sent" on the Send to Kindle button —
 * holds before the control returns to idle.
 */
export const TRANSIENT_CONFIRMATION_MS = 2500
