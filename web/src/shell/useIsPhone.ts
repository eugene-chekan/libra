import { useSyncExternalStore } from 'react'

import { PHONE_QUERY } from '../theme/breakpoints'

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(PHONE_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/**
 * Whether the window is phone-sized, kept right as it changes.
 *
 * Almost everything about this layout is CSS. This exists for the one thing
 * CSS cannot do: put the sidebar inside a dialog on a phone and beside the
 * page on a desktop, which is a different tree rather than a different rule.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}
