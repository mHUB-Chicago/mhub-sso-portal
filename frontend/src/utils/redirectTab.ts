// Shared across the whole login → change-password chain (Sign In, then possibly Set
// Password on a separate mounted page) so we open at most ONE tab per flow instead of
// one per step. Module-level state survives an SPA route change (still the same JS
// execution context, no full page reload) even though each page's own component state
// does not.
//
// Reusing an existing Window reference via `.location.href =` is not subject to popup
// gesture rules at all — only creating a NEW window with window.open() is — so once a
// tab is opened here, later steps can navigate it without needing their own user
// gesture or their own window.open() call.
let tab: Window | null = null
let openedAt = 0
let loadedPromise: Promise<void> = Promise.resolve()

// Upper bound on how long to wait for the tab's own `load` event before giving up and
// swapping it anyway — covers cases where the event never fires (e.g. blocked by an
// extension) so callers never hang indefinitely.
const MAX_TAB_LOAD_WAIT_MS = 5000

export const openRedirectTab = (url: string): Window | null => {
  tab = window.open(url, '_blank')
  openedAt = Date.now()
  // `load` fires on a cross-origin popup's Window without violating CORS (it doesn't
  // expose any content, just that the top-level navigation finished) — used instead of
  // a fixed timer so the swap to the real URL only happens once the fake page has
  // actually rendered, rather than possibly mid-navigation on a slow connection.
  const openedTab = tab
  loadedPromise = openedTab
    ? new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        openedTab.removeEventListener('load', finish)
        resolve()
      }
      openedTab.addEventListener('load', finish)
      setTimeout(finish, MAX_TAB_LOAD_WAIT_MS)
    })
    : Promise.resolve()
  return tab
}

export const getRedirectTab = (): Window | null => {
  // If the member manually closed the popup while waiting, fall back to null so
  // callers know to open a fresh one instead of trying to reuse a dead reference.
  if (tab?.closed) {
    tab = null
  }
  return tab
}

export const getRedirectTabOpenedAt = (): number => openedAt

// Resolves once the pre-opened tab's own page has finished loading (or after
// MAX_TAB_LOAD_WAIT_MS, whichever comes first) — await this before swapping it to the
// real URL instead of a fixed delay from open time.
export const getRedirectTabLoadPromise = (): Promise<void> => loadedPromise

export const clearRedirectTab = (): void => {
  tab = null
  openedAt = 0
  loadedPromise = Promise.resolve()
}
