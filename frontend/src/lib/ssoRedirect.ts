// Some post-login redirects point at OUR OWN IdP-initiated SSO endpoint
// (/saml/sso/:id?relayState=<finalUrl>) rather than straight at the destination — completing
// that handshake needs a real page load (it auto-submits a hidden form to the SP's ACS), but
// the SP (PeopleVine) doesn't land on the specific page named in RelayState afterward, just
// wherever its current session defaults to post-login. A stale session from a previously
// logged-in account (same browser, different person) can make PV silently keep that old
// session instead of switching — so we log out of the destination first, then run the SSO
// handshake, both in a hidden iframe (cookies aren't scoped per-frame/tab, and a hidden
// iframe still triggers Set-Cookie even though PV's X-Frame-Options blocks it from
// rendering). Once that's done we send the visible window straight to the real destination
// and it'll already be authenticated there, fresh.
const LOGOUT_SETTLE_DELAY_MS = 1000
const SSO_SETTLE_DELAY_MS = 1800

const extractRelayState = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes('/saml/sso/')) return null
    return parsed.searchParams.get('relayState')
  } catch {
    return null
  }
}

const loadInHiddenIframe = (src: string): void => {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = src
  document.body.appendChild(iframe)
}

export const completeSsoAndRedirect = (url: string): void => {
  const relayStateDestination = extractRelayState(url)
  if (!relayStateDestination) {
    window.location.assign(url)
    return
  }

  try {
    const destinationOrigin = new URL(relayStateDestination).origin
    loadInHiddenIframe(`${destinationOrigin}/logout`)
  } catch {
    // Malformed destination — skip the logout step, still try the SSO handshake below.
  }

  window.setTimeout(() => {
    loadInHiddenIframe(url)
    window.setTimeout(() => {
      window.location.assign(relayStateDestination)
    }, SSO_SETTLE_DELAY_MS)
  }, LOGOUT_SETTLE_DELAY_MS)
}
