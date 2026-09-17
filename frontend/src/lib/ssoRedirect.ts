// Reverted twice now: both a hidden-iframe logout+SSO handshake and a fetch()-based
// logout-then-navigate were tried here to work around PeopleVine not landing on
// RelayState's target page after a stale session from a different account, but both
// introduced their own new failure modes against PV's real server (the iframe approach
// sometimes left the user logged out entirely; the fetch-logout approach appears to have
// triggered a 502 from PV's own server, likely a race condition from hitting them with a
// logout immediately followed by a fresh SAML assertion). PV's server has proven too
// fragile for either automated workaround to be reliable. Back to a plain top-level
// redirect — if PV doesn't land on the right page/identity, the person just needs to log
// out on PV's side manually and retry, or use a fresh browser session per test account.
export const completeSsoAndRedirect = (url: string): void => {
  window.location.assign(url)
}
