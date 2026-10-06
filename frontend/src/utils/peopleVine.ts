export const PEOPLEVINE_ORIGIN = 'https://member.mhubchicago.com'
// The root, not /home — see PEOPLEVINE_HOME_URL in the backend's onboardingController.ts.
export const PEOPLEVINE_ROOT_URL = `${PEOPLEVINE_ORIGIN}/`

// PV's page style 1960 (the logged-out one its login page uses) has a head script, added in
// the PV admin 2026-10-06: when PV's login page is reached with one of these hashes, it hides
// the page and starts mHUB SSO into the matching IdP straight away. So sending a member to
// PV's root with the hash logs them in within the same tab — no PV login screen, no pre-opened
// tab — and PV lands on its root (→ /home, member style), never a stale page like the
// onboarding payment form. Already logged into PV, the root goes straight to /home.
const SSO_MARKERS: Record<string, string> = {
  'https://auth.portal.mhub.org': '#mhub-sso',
  'https://auth.mhubsso.com': '#mhub-sso-staging',
}

// Null where PV's script has no marker for this IdP (e.g. local dev) — callers fall back to
// the pre-opened-tab flow.
export const getPeopleVineSsoUrl = (): string | null => {
  const marker = SSO_MARKERS[(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')]
  return marker ? `${PEOPLEVINE_ROOT_URL}${marker}` : null
}
