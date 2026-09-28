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

// How long to keep waiting for the fake page to actually commit before giving up. On
// timeout the load promise REJECTS (it never resolves "anyway") — callers must not
// proceed with the SSO flow unless the fake page is confirmed loaded first.
const MAX_TAB_LOAD_WAIT_MS = 20000
const LOAD_POLL_INTERVAL_MS = 100
// Extra time after the cross-origin navigation commits, so the fake page gets to
// render (and its subresources/cookies settle) before anything else happens.
const POST_COMMIT_SETTLE_MS = 1500

// A `load` listener can't be used here: window.open() returns the initial about:blank
// Window, and once the popup navigates cross-origin that Window object is replaced, so
// a listener attached to it either fires early (for about:blank) or never. Instead,
// poll `location.href`: readable while the popup is still on the same-origin
// about:blank, it throws a SecurityError the moment the cross-origin page commits —
// which is also the moment the browser records it in history.
const waitForCrossOriginCommit = (openedTab: Window): Promise<void> =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (openedTab.closed) {
        clearInterval(timer)
        reject(new Error('The member.mhubchicago.com tab was closed before it finished loading. Please try signing in again.'))
        return
      }
      let committed = false
      try {
        void openedTab.location.href
      } catch {
        committed = true
      }
      if (committed) {
        clearInterval(timer)
        setTimeout(resolve, POST_COMMIT_SETTLE_MS)
      } else if (Date.now() - startedAt > MAX_TAB_LOAD_WAIT_MS) {
        clearInterval(timer)
        reject(new Error('member.mhubchicago.com took too long to load. Please try signing in again.'))
      }
    }, LOAD_POLL_INTERVAL_MS)
  })

export const openRedirectTab = (url: string): Window | null => {
  tab = window.open(url, '_blank')
  openedAt = Date.now()
  loadedPromise = tab ? waitForCrossOriginCommit(tab) : Promise.resolve()
  // Avoid an unhandled-rejection warning if nothing awaits it (e.g. flow aborted early).
  loadedPromise.catch(() => {})
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

// Resolves once the pre-opened tab's fake page has committed and settled; rejects if it
// was closed or didn't load within MAX_TAB_LOAD_WAIT_MS. Await this before doing
// anything SSO-related.
export const getRedirectTabLoadPromise = (): Promise<void> => loadedPromise

export const clearRedirectTab = (): void => {
  tab = null
  openedAt = 0
  loadedPromise = Promise.resolve()
}
