import { Context } from "hono";
import { PEOPLEVINE_SP_ENTITY_ID } from "@/controllers/onboardingController";

// PeopleVine's cookies (ASP.NET_SessionId, data, domain, companyMain, …) are all HttpOnly with
// no SameSite=None, so Chrome only sends them on a cross-site POST for ~2 minutes after
// they're set. A SAML Response POSTed from our IdP page is exactly that, so in any browser
// whose PV cookies are older than 2 minutes, PV's /login/sso gets a partial set and returns
// 502 (reproduced 2026-10-06).
//
// Instead, we hand the SAML Response to PV's own login page in the URL fragment, which
// browsers never send to any server, and a head script there (PV page styles 1960 and 1560,
// see docs/peoplevine-changes.md) POSTs it to /login/sso from PV's own origin. A same-site
// POST carries every PV cookie, however old: verified against production PV with 2m40s-old
// cookies (cross-site: 502; via PV's page: logged in). The script strips the fragment before
// any tracking script on the page runs, and these responses expire after 5 minutes.
//
// /login, not /: visiting /login leaves PV's "last page viewed" alone, and that's where PV
// lands after SSO (the onboarding payment form, or "/" for portal logins).
const PEOPLEVINE_HANDOFF_URL = "https://member.mhubchicago.com/login";

// The PV page to hand this service provider's SAML Response to, or null to POST it as usual.
// PV_SAML_HANDOFF=off goes back to the plain POST — only if PV's script is gone, since
// members would then get the 502 again.
export const getPeopleVineHandoffUrl = (c: Context, spEntityId: string): string | null => {
  if (spEntityId !== PEOPLEVINE_SP_ENTITY_ID) return null;
  if ((c.env.PV_SAML_HANDOFF as string | undefined)?.toLowerCase() === "off") return null;
  return PEOPLEVINE_HANDOFF_URL;
};
