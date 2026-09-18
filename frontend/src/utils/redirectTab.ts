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

export const openRedirectTab = (url: string): Window | null => {
  tab = window.open(url, '_blank')
  openedAt = Date.now()
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

export const clearRedirectTab = (): void => {
  tab = null
  openedAt = 0
}
