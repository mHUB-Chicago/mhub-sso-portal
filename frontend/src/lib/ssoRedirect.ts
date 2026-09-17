// Reverted: a hidden-iframe logout+SSO handshake was tried here to work around PeopleVine
// not landing on RelayState's target page, but it proved unreliable in practice — browsers
// throttle/deprioritize JS in display:none iframes, so the SSO re-login inside the iframe
// sometimes didn't finish before the visible redirect fired, leaving the user logged out
// entirely (worse than the original "logged in, wrong page" behavior). Back to a plain
// redirect; if PV doesn't land on the right page, the person just needs one more click
// through to the specific form once actually logged in.
export const completeSsoAndRedirect = (url: string): void => {
  window.location.assign(url)
}
