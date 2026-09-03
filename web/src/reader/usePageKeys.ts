import { useEffect } from 'react'

const FORWARD = new Set([' ', 'ArrowRight', 'PageDown'])
const BACK = new Set(['ArrowLeft', 'PageUp'])

/** Somewhere the reader is typing, where a space is a space. */
function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (element === null) return false
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable
}

/**
 * Arrow keys, Page Up and Page Down, and Space, so the book reads without a mouse.
 *
 * A hook: a function a component calls to borrow behaviour. This one listens on the whole
 * window, because the text itself lives in an iframe that never gives the page its key presses.
 */
export function usePageKeys(onPrevious: () => void, onNext: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      if (FORWARD.has(event.key)) {
        event.preventDefault()
        onNext()
      } else if (BACK.has(event.key)) {
        event.preventDefault()
        onPrevious()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onNext, onPrevious])
}
