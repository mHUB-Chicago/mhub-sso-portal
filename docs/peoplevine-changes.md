# Changes made inside PeopleVine (PV)

Some fixes for the SSO portal live in PeopleVine's own admin, not in this repo. If PV's admin is reset, a page style is replaced, or someone tidies the head code, these changes disappear and the problems below come back. This file records what was changed, why, and how to check it.

The code below is what was live on `member.mhubchicago.com` on 2026-10-06.

## Summary

| # | Where in PV admin | What it does | Our code that depends on it |
|---|---|---|---|
| 1 | Page styles **1960** and **1560** → head code | Skips PV's login screen and starts mHUB SSO when the portal sends someone with `#mhub-sso` | `frontend/src/utils/peopleVine.ts` (login page, dashboard PV tile) |
| 2 | Page **22283** "Portal Homepage" (`/home`) → page CSS | Fixes the member homepage not scrolling | None |
| 3 | Page **22283** "Portal Homepage" (`/home`) → page JS | Reloads `/home` once if it renders in the public (logged-out) style | None. It's a backup since the portal lands members on `/` |

## Background: how PV behaves (verified against production PV)

- **PV ignores SAML RelayState.** After SSO it sends the member to the last PV page that browser visited, which it keeps in its own `data` cookie. One visit to the onboarding payment form used to make every later login land on the form. The portal works around this by making sure the browser's last PV visit is `/` before the SSO finishes.
- **Logged-out pages use page style 1960; member pages use 1560.** The choice sticks for the browser session. Visiting `/` re-picks it. Landing straight on `/home` after a logged-out visit can keep 1960, which looks like "broken CSS" on the member homepage.
- **PV's SSO start link** is `https://member.mhubchicago.com/login/sso/start?route=<our IdP>/saml`. The IdP is `https://auth.portal.mhub.org/saml` in prod and `https://auth.mhubsso.com/saml` in staging.
- **PV's cookies have no `SameSite=None`.** Chrome only sends them on our cross-site SAML POST for about 2 minutes after they're set. After that, `POST /login/sso` returns **502**. Only PeopleVine can fix this, by setting `SameSite=None; Secure` on its cookies. Nothing below changes that.

## 1. Page styles 1960 and 1560: skip PV's login screen for portal SSO

**Where:** the same snippet is in two page layouts' head code boxes (PV admin → `admin page layout create`, `flag=edit`, `page style no=…`):

- **1960**, the logged-out style that PV's login page uses: at the very top of the box (the one with Google Tag Manager, HubSpot and the Meta pixel). This is the copy that does the SSO.
- **1560**, "Sidebar Layout for Member Portal", the logged-in style: just after the `<meta name="viewport">` line, so it stays after `<meta charset>`. A member who is already logged in goes `/` → `/home` in this style, and this copy only removes the marker from the address bar.

Both copies run before the page draws, and **both must stay identical**.

**Why:** the portal used to open PV in a pre-opened second tab, so that PV landed on home rather than a stale page. That showed PV's login screen, needed pop-up permission, and left the original login tab behind on a spinner. With this script, the portal sends the member to PV's root in the **same tab** with a marker. PV's login page hides itself and starts mHUB SSO straight away. Because the last PV page visited is `/`, PV lands on home in the member style.

**How it's triggered:** only by the URL hash `#mhub-sso` (prod) or `#mhub-sso-staging` (staging). Nothing else on PV sends those hashes, so normal visits to PV's login page are unaffected. A loop guard stops it re-running within 60 seconds and shows the normal login page instead.

```html
<!-- mHUB SSO: when the mHUB portal sends someone here (#mhub-sso), skip this login screen and start mHUB SSO straight away. Added 2026-10-06 for the mHUB SSO portal. -->
<script>
(function () {
  var routes = {
    '#mhub-sso': 'https://auth.portal.mhub.org/saml',
    '#mhub-sso-staging': 'https://auth.mhubsso.com/saml'
  };
  var route = routes[location.hash];
  if (!route) return;
  // Only on the login page. Anywhere else (e.g. already logged in, so PV went to /home), just tidy the URL.
  if (!/^\/login(\.aspx)?\/?$/i.test(location.pathname)) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return;
  }
  // Loop guard: if this already ran in the last minute, show the normal login page instead.
  try {
    var last = Number(sessionStorage.getItem('mhubSsoAt')) || 0;
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem('mhubSsoAt', String(Date.now()));
  } catch (e) { return; }
  document.documentElement.style.visibility = 'hidden';
  location.replace('/login/sso/start?route=' + route);
})();
</script>
<!-- End mHUB SSO -->
```

**Our side:** `frontend/src/utils/peopleVine.ts` maps the portal's API URL to the marker. The login page (`frontend/src/pages/login/index.tsx`) and the dashboard PV tile (`frontend/src/pages/dashboard/index.tsx`) use it. Onboarding (the payment form) still uses the pre-opened tab and doesn't rely on this script.

**If you change it:**
- Adding a new environment means a new entry in `routes` in **both** style copies **and** in `SSO_MARKERS` in `peopleVine.ts`.
- If the script is removed, members sent with the marker stop on PV's login page. Restore the script, or remove the marker from `peopleVine.ts` so the portal falls back to the pre-opened tab.

If the 1560 copy is ever lost, nothing breaks. Logged-in members just see `/home#mhub-sso` in the address bar.

**Check it's live:** load `https://member.mhubchicago.com/login`, view the source, and search for `mhub-sso-staging`.

**Test:** log into the staging portal, then open `https://member.mhubchicago.com/#mhub-sso-staging` in the same browser. You should land on PV home, logged in, without seeing PV's login page.

## 2. Page 22283 "Portal Homepage": scroll fix (page CSS)

**Where:** PV admin → Pages → **Portal Homepage** (`/account_customer_menu`, page no 22283) → page CSS, inside the `@media(min-width:1024px)` block.

**Why:** the page CSS had `body{overflow:hidden}`, which made the page unscrollable whenever it rendered without the member layout's own scrolling container (`.wrapper #content`), i.e. in the public style. It now only hides body overflow when that container exists.

**Change:** inside `@media(min-width:1024px){…}`:

```css
/* before */
body{overflow:hidden}
/* after */
body:has(.wrapper #content){overflow:hidden;}
```

Live file: `https://peoplevine.blob.core.windows.net/files/397/style/22283_page_css.min.css`

## 3. Page 22283 "Portal Homepage": public-style reload (page JS)

**Where:** same page → page JS.

**Why:** if `/home` renders in the public style 1960 (no `.wrapper #content`), it reloads via `/` once, which re-picks the member style. Since the portal now lands members on `/` (see change 1 and `PEOPLEVINE_HOME_URL` in `backend/src/controllers/onboardingController.ts`), this should rarely fire. It's kept as a backup. A 60-second guard prevents loops.

Readable version of the live (minified) script:

```js
(function () {
  function check() {
    if (document.querySelector('.wrapper #content')) return; // member style: nothing to do
    try {
      var last = Number(sessionStorage.getItem('pvStyleResetAt') || 0);
      if (Date.now() - last < 60000) return;
      sessionStorage.setItem('pvStyleResetAt', String(Date.now()));
    } catch (e) { return; }
    location.replace('/');
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', check) : check();
})();
```

Live file: `https://peoplevine.blob.core.windows.net/files/397/js/22283_page_js.min.js`

## Still needed from PeopleVine

The 502 on `POST /login/sso` (see Background) can only be fixed by PeopleVine. Ask them to set `SameSite=None; Secure` on their cookies (`ASP.NET_SessionId`, `ARRAffinity`, `data`, `domain`, `companyMain`, `cartInfo`, `locale`, `settings`), or to make `/login/sso` work when those cookies are missing. Repro: start PV's SSO, wait 2.5 minutes before finishing sign-in, and it returns 502 every time.
