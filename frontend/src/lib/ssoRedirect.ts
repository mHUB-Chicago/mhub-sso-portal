// Some post-login redirects point at OUR OWN IdP-initiated SSO endpoint
// (/saml/sso/:id?relayState=<finalUrl>) rather than straight at the destination — completing
// that handshake needs a real page load (it auto-submits a hidden form to the SP's ACS), but
// the SP (PeopleVine) doesn't land on the specific page named in RelayState afterward, just
// wherever it defaults to post-login. Loading it in a hidden iframe still establishes the SP's
// session cookie (cookies aren't scoped per-frame/tab), so once that's done we can send the
// visible window straight to the real destination and it'll already be authenticated there.
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

export const completeSsoAndRedirect = (url: string): void => {
  const relayStateDestination = extractRelayState(url)
  if (!relayStateDestination) {
    window.location.assign(url)
    return
  }
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = url
  document.body.appendChild(iframe)
  window.setTimeout(() => {
    window.location.assign(relayStateDestination)
  }, SSO_SETTLE_DELAY_MS)
}
