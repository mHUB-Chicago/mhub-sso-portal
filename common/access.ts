// The portal's login rule, in one place: the backend login check (loginController.ts)
// and the admin screens both use it, so what admins see can't drift from what login does.

// Whether the user's primary membership or any add-on is one of the Portal Access Types.
// Same matching as the backend's hasPortalAccess (peopleVineService.ts): trimmed, exact names.
export const hasPortalMembership = (
  portalAccessTypes: ReadonlySet<string>,
  primaryMembership: string | null | undefined,
  addOnsJson?: string | null,
): boolean => {
  const candidates: string[] = [];
  if (primaryMembership) candidates.push(primaryMembership.trim());
  if (addOnsJson) {
    try {
      candidates.push(...(JSON.parse(addOnsJson) as string[]).map(a => a.trim()));
    } catch { /* malformed add-ons count as none */ }
  }
  return candidates.some(name => portalAccessTypes.has(name));
};

type AccessUser = { role: string; accountStatus: string; active: boolean };

// Admins always get in. Onboarding (pending_membership) users get in to reach the payment
// form. Everyone else needs the synced `active` flag AND a portal-access membership.
export const canLogIn = (user: AccessUser, portalMembership: boolean): boolean =>
  user.role === 'ADMIN' || user.accountStatus === 'pending_membership' || (user.active && portalMembership);

// What the admin screens show. Deliberately no "why" for blocked users: the portal doesn't
// record the reason the sync marked someone inactive, so the screens show the facts instead
// of guessing one.
export type LoginAccess = 'admin' | 'onboarding' | 'allowed' | 'blocked';
export const loginAccess = (user: AccessUser, portalMembership: boolean): LoginAccess => {
  if (user.role === 'ADMIN') return 'admin';
  if (user.accountStatus === 'pending_membership') return 'onboarding';
  return canLogIn(user, portalMembership) ? 'allowed' : 'blocked';
};
