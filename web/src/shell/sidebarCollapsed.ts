const KEY = 'libra.sidebar.collapsed'

/** Whether the sidebar was left collapsed. Expanded whenever there is nothing usable stored. */
export function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

/** Remembers the choice for next time, and shrugs if storage is blocked. */
export function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, String(collapsed))
  } catch {
    // A reader with storage turned off still gets what they picked, for this session.
  }
}
