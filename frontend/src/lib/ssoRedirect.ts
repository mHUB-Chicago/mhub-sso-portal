// Some post-login redirects point at OUR OWN IdP-initiated SSO endpoint
// (/saml/sso/:id?relayState=<finalUrl>) rather than straight at the destination — completing
// that handshake needs a real top-level page navigation (it auto-submits a hidden form to
// the SP's ACS), but the SP (PeopleVine) doesn't land on the specific page named in
// RelayState afterward — just wherever its current session defaults to post-login. A stale
// session from a previously logged-in account (same browser, different person) can make PV
// keep that old session/identity instead of switching to the new one.
//
// Fix: fire a background fetch() at PV's own logout URL first (GET, credentials included,
// no-cors since we don't need to read the response — just need the browser to hit it so PV's
// Set-Cookie clears the stale session). fetch() isn't subject to X-Frame-Options (that only
// blocks frame/iframe *rendering*, not fetch/XHR), and its Promise resolving is a real
// "the network round-trip finished" signal instead of a guessed setTimeout. Once that
// settles, do the actual SSO handshake as a normal top-level navigation (not a hidden
// iframe) — hidden iframes turned out to be unreliable here since browsers can
// throttle/deprioritize JS execution inside display:none frames, so the auto-submit
// sometimes didn't finish before we tried to navigate away.
//
// This does NOT guarantee landing on the exact RelayState page (PV still doesn't honor
// that), but it does ensure the session PV ends up with is the fresh, correct one.
const extractRelayStateOrigin = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes('/saml/sso/')) return null;
    const relayState = parsed.searchParams.get('relayState');
    return relayState ? new URL(relayState).origin : null;
  } catch {
    return null;
  }
};

export const completeSsoAndRedirect = (url: string): void => {
  const destinationOrigin = extractRelayStateOrigin(url);
  if (!destinationOrigin) {
    window.location.assign(url);
    return;
  }

  const proceedToSso = () => window.location.assign(url);

  fetch(`${destinationOrigin}/logout`, {
    method: 'GET',
    mode: 'no-cors',
    credentials: 'include',
  })
    .then(proceedToSso)
    .catch(proceedToSso);
};
