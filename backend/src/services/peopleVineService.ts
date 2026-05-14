import { Context } from 'hono';
import { Company, PeopleVineToken, PeopleVineTokenType, PrismaClient, Role, User } from '@prisma/client';
import { createCompany, deactivateCompany, updateCompany } from './companyService';
import { createUser, deactivateUser, updateUser } from './userService';

// Process items in concurrent batches to avoid OOM from thousands of simultaneous DB ops
const runConcurrent = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(fn));
  }
};

const PEOPLEVINE_API_BASE_URL = 'https://api.peoplevine.dev/api';


export const hasPortalAccess = async (c: Context, membershipType: string | null | undefined): Promise<boolean> => {
  if (!membershipType) return false;
  const prisma: PrismaClient = c.get('db');
  const type = await prisma.portalAccessType.findUnique({ where: { name: membershipType.trim() } });
  return type !== null;
};

interface RequestOptions {
  tokenType: PeopleVineTokenType;
  endpoint: string;
  method: 'GET';
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface PeopleVineCustomer {
  id: number;
  company_name: string;
  full_name: string;
  email: string;
  username?: string | null;
  isPersonal?: boolean;
  pvActive?: boolean;
  profilePhoto?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cardStatus?: string | null;
}

export interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const makeSessionFlusher = (prisma: PrismaClient, sessionId: string | undefined) => {
  const logs: LogEntry[] = [];
  let meta: Record<string, unknown> = {};

  const log = (level: LogEntry['level'], message: string) => {
    if (level === 'error') console.error(message);
    else if (level === 'warn') console.warn(message);
    else console.log(message);
    logs.push({ time: new Date().toISOString(), level, message });
  };

  const flush = async (progress: number, step: string, status = 'running') => {
    if (!sessionId) return;
    try {
      const current = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { logs: true } }).catch(() => null);
      const existing: LogEntry[] = current?.logs ? JSON.parse(current.logs) : [];
      const merged = [...existing, ...logs];
      logs.length = 0;
      await prisma.syncSession.update({
        where: { id: sessionId },
        data: { progress, step, status, logs: JSON.stringify(merged) },
      });
    } catch (e) {
      console.error('Failed to update sync session:', e);
    }
  };

  const saveMeta = async (patch: Record<string, unknown>) => {
    if (!sessionId) return;
    try {
      const current = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { metadata: true } }).catch(() => null);
      const existing: Record<string, unknown> = current?.metadata ? JSON.parse(current.metadata) : {};
      meta = { ...existing, ...meta, ...patch };
      await prisma.syncSession.update({ where: { id: sessionId }, data: { metadata: JSON.stringify(meta) } });
    } catch (e) {
      console.error('Failed to save sync metadata:', e);
    }
  };

  return { log, flush, saveMeta };
};

const setToken = async (c: Context, tokenType: PeopleVineTokenType, accessToken: string, refreshToken: string, expiresAt: Date): Promise<PeopleVineToken> => {
  const prisma: PrismaClient = c.get('db');
  const existingToken = await prisma.peopleVineToken.findFirst({
    where: {
      tokenType,
    },
  });
  let returnToken: PeopleVineToken;
  if (existingToken) {
    returnToken = await prisma.peopleVineToken.update({
      where: { id: existingToken.id },
      data: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  } else {
    returnToken = await prisma.peopleVineToken.create({
      data: {
        tokenType,
        accessToken,
        refreshToken,
        expiresAt,
      },
    });
  }
  return returnToken;
}

const getStoredToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken | null> => {
  const prisma: PrismaClient = c.get('db');
  const tokenRecord = await prisma.peopleVineToken.findFirst({
    where: {
      tokenType,
    },
  });
  return tokenRecord;
}

const getUserToken = async (c: Context): Promise<PeopleVineToken> => {
  const storedToken = await getStoredToken(c, PeopleVineTokenType.USER);
  // Check if token is still valid (skew by 1 minute)
  if (storedToken && storedToken.expiresAt > new Date(Date.now() + 60000)) {
    return storedToken;
  }
  const peoplevineAdminUsername = c.env.PEOPLEVINE_ADMIN_USERNAME;
  const peoplevineAdminPassword = c.env.PEOPLEVINE_ADMIN_PASSWORD;
  const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: peoplevineAdminUsername,
      password: peoplevineAdminPassword,
      remember_me: true,
      grant_type: 'password',
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const errorStatus = response.status;
    console.error(`Error response (${errorStatus}): ${errorText}`);
    throw new Error('Failed to obtain user auth token');
  }
  const responseData: any = await response.json();
  const accessToken = responseData.access_token;
  const refreshToken = responseData.refresh_token;
  const expiresIn = responseData.expires_in;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  return setToken(c, PeopleVineTokenType.USER, accessToken, refreshToken, expiresAt);
};

const exchangeUserToCompanyToken = async (c: Context, userTokenRecord: PeopleVineToken, companyId: number): Promise<PeopleVineToken> => {
  const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'access_token',
      company_id: companyId,
      access_token: userTokenRecord.accessToken,
      refresh_token: userTokenRecord.refreshToken,
      remember_me: true,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const errorStatus = response.status;
    console.error(`Error response (${errorStatus}): ${errorText}`);
    const err = new Error('Failed to obtain user company auth token') as Error & { status: number };
    err.status = errorStatus;
    throw err;
  }
  const data: any = await response.json();
  return setToken(c, PeopleVineTokenType.USER_COMPANY, data.access_token, data.refresh_token, new Date(Date.now() + data.expires_in * 1000));
};

const getUserCompanyToken = async (c: Context): Promise<PeopleVineToken> => {
  const storedToken = await getStoredToken(c, PeopleVineTokenType.USER_COMPANY);
  // Check if token is still valid (skew by 1 minute)
  const expiresAtMs = storedToken ? new Date(storedToken.expiresAt).getTime() : 0;
  const isValid = expiresAtMs > Date.now() + 60000;
  if (storedToken && isValid) {
    return storedToken;
  }
  const companyId = parseInt(c.env.PEOPLEVINE_COMPANY_ID as string);
  const userTokenRecord = await getUserToken(c);
  try {
    return await exchangeUserToCompanyToken(c, userTokenRecord, companyId);
  } catch (e: any) {
    if (e?.status === 400) {
      // PV invalidated the refresh token server-side — purge both cached tokens and re-login
      const prisma: PrismaClient = c.get('db');
      await prisma.peopleVineToken.deleteMany({
        where: { tokenType: { in: [PeopleVineTokenType.USER, PeopleVineTokenType.USER_COMPANY] } },
      }).catch(() => {});
      const freshUserToken = await getUserToken(c);
      return exchangeUserToCompanyToken(c, freshUserToken, companyId);
    }
    throw e;
  }
}

const getAuthToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken> => {
  if (tokenType === PeopleVineTokenType.USER) {
    return getUserToken(c);
  } else if (tokenType === PeopleVineTokenType.USER_COMPANY) {
    return getUserCompanyToken(c);
  } else {
    throw new Error('Invalid token type requested');
  }
};

const apiRequest = async (c: Context, options: RequestOptions): Promise<any> => {
  const { endpoint, method, headers, queryParams } = options;

  if ((method as string) !== 'GET') {
    const msg = `[PeopleVine] BLOCKED: ${method} ${endpoint} — PeopleVine is read-only. Write operations are not permitted.`;
    console.error(msg);
    throw new Error(msg);
  }

  const queryString = queryParams
    ? '?' + new URLSearchParams(queryParams).toString()
    : '';

  const executeRequest = async (): Promise<any> => {
    const authTokenRecord: PeopleVineToken = await getAuthToken(c, options.tokenType);
    const fullUrl = `${PEOPLEVINE_API_BASE_URL}${endpoint}${queryString}`;
    console.log(`[PeopleVine] GET ${fullUrl}`);
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authTokenRecord.accessToken}`,
        ...(headers || {}),
      },
    });
    if (!response.ok) {
      const resText = await response.text();
      const status = response.status;
      let errorDetails = resText;
      try { errorDetails = JSON.stringify(JSON.parse(resText), null, 2); } catch {}
      throw new Error(`API request failed with status ${status}\n${errorDetails}`);
    }
    return response.json();
  };

  try {
    return await executeRequest();
  } catch (e) {
    // PV returns 400 when the access token has been invalidated server-side.
    // Purge both USER and USER_COMPANY so the next retry goes straight to fresh password
    // login — skipping the stale-cached-USER → invalid_refresh_token intermediate failure.
    if (e instanceof Error && e.message.includes('status 400') && options.tokenType === PeopleVineTokenType.USER_COMPANY) {
      const prisma: PrismaClient = c.get('db');
      await prisma.peopleVineToken.deleteMany({
        where: { tokenType: { in: [PeopleVineTokenType.USER, PeopleVineTokenType.USER_COMPANY] } },
      }).catch(() => {});
    }
    throw e;
  }
}

const normalizeCustomers = (customers: any[]): PeopleVineCustomer[] => {
  return customers.map((customer) => {
    let companyName = (customer.company_name ?? '').trim();
    const isPersonal = companyName.length === 0;
    if (isPersonal) {
      companyName = customer.full_name.trim().concat("'s Company");
    }
    const pvActive = customer.status == null ? true : customer.status.toLowerCase() === 'active';
    const profilePhoto = (customer.profile_photo && customer.profile_photo.trim().length > 0)
      ? customer.profile_photo.trim()
      : null;
    const rawEmail = customer.email ? customer.email.toLowerCase().trim() : '';
    const username = (customer.username ?? '').trim() || null;
    const email = rawEmail.length > 0 ? rawEmail : (username ? `${customer.id}@noemail.mhub` : '');
    const trimmedName = customer.full_name ? customer.full_name.trim() : '';
    const full_name = trimmedName.length > 0 ? trimmedName : (username ?? email.split('@')[0]);
    const phone = customer.mobile?.number || customer.phone?.number || null;
    const address = customer.address?.address || null;
    const city = customer.address?.city || null;
    const state = customer.address?.state || null;
    const zipCode = customer.address?.zip_code || null;
    const cardStatus = customer.wallet?.status || null;
    return ({
      ...customer,
      full_name,
      company_name: companyName,
      email,
      username,
      isPersonal,
      pvActive,
      profilePhoto,
      phone,
      address,
      city,
      state,
      zipCode,
      cardStatus,
    });
  }).filter((customer) => {
    return customer.email && customer.email.length > 0;
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getCustomersFromSubscriptions = async (c: Context, customerNo?: string): Promise<{
  customers: PeopleVineCustomer[];
  hadErrors: boolean;
  subscriptionInfoMap: Map<string, { membershipType: string | null; isActive: boolean }>;
  individualSubscriberIds: Set<string>;
}> => {
  let subscriptions: any[] = [];
  let pageNumber = 1;
  const pageSize = 100;
  let consecutiveErrors = 0;
  let hadErrors = false;
  do {
    let retrievedSubscriptions: any[];
    let attempt = 0;
    let success = false;
    let lastErr: unknown;
    while (attempt < 3) {
      try {
        retrievedSubscriptions = await apiRequest(c, {
          tokenType: PeopleVineTokenType.USER_COMPANY,
          endpoint: '/subscriptions',
          method: 'GET',
          queryParams: {
            page_size: pageSize.toString(),
            page_number: pageNumber.toString(),
            ...(customerNo ? { Customer_Id: customerNo } : {}),
          },
        });
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt < 3) {
          await sleep(1000 * attempt);
        }
      }
    }
    if (!success) {
      console.warn(`[subscriptions] page ${pageNumber} failed after 3 attempts: ${lastErr}`);
      hadErrors = true;
      pageNumber++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      continue;
    }
    consecutiveErrors = 0;
    subscriptions = subscriptions.concat(retrievedSubscriptions!);
    pageNumber++;
    if (retrievedSubscriptions!.length === 0 || retrievedSubscriptions!.length < pageSize) {
      break;
    }
  } while (true);

  const prisma: PrismaClient = c.get('db');
  const [dbCompanyTypes, dbPortalTypes] = await Promise.all([
    prisma.companyMembershipType.findMany({ select: { name: true } }),
    prisma.portalAccessType.findMany({ select: { name: true } }),
  ]);
  const companyMembershipTypes = new Set(dbCompanyTypes.map(t => t.name));
  const portalAccessTypes = new Set(dbPortalTypes.map(t => t.name));

  // Build subscription info map from ALL subscriptions — used for individual fallback checks
  const subscriptionInfoMap = new Map<string, { membershipType: string | null; isActive: boolean }>();
  const individualSubscriberIds = new Set<string>();
  for (const sub of subscriptions) {
    const customer = sub?.customer;
    if (customer?.id) {
      const pvId = customer.id.toString();
      const membershipType = sub.title ? sub.title.trim() : null;
      const subIsActive = sub.status == null ? true : sub.status.toLowerCase() === 'active';
      const existing = subscriptionInfoMap.get(pvId);
      const newHasPortal = membershipType ? portalAccessTypes.has(membershipType) : false;
      const existingHasPortal = existing?.membershipType ? portalAccessTypes.has(existing.membershipType) : false;
      // Prefer portal-access types over non-portal ones (e.g. Shared Workspace > Parking)
      const shouldReplace =
        !existing ||
        (subIsActive && !existing.isActive) ||
        (subIsActive && existing.isActive && !existingHasPortal && newHasPortal);
      if (shouldReplace) {
        subscriptionInfoMap.set(pvId, { membershipType, isActive: subIsActive });
      }
      if (subIsActive) individualSubscriberIds.add(pvId);
    }
  }

  // Filter to company-level subscription types only — individual-level subscriptions
  // (e.g. mHUB Community, Equipment Certifications) do not create company records
  const companySubscriptions = subscriptions.filter(sub =>
    sub.title && companyMembershipTypes.has(sub.title.trim())
  );

  let companies = companySubscriptions.map((sub: any) => sub?.customer || null).filter(Boolean);

  // Dedup by normalised company name — prevents two PV customer records for the same org
  // from creating duplicate company entries
  const companyNameMap = new Map<string, any>();
  for (const co of companies) {
    const key = (co.company_name ?? '').trim().toLowerCase();
    if (!companyNameMap.has(key)) companyNameMap.set(key, co);
  }
  companies = Array.from(companyNameMap.values());

  return { customers: normalizeCustomers(companies), hadErrors, subscriptionInfoMap, individualSubscriberIds };
};

const getCustomers = async (
  c: Context,
  startPage = 1,
  maxPages?: number,
  onPageFetched?: (page: number) => Promise<void>,
): Promise<{ customers: PeopleVineCustomer[]; hadErrors: boolean; lastPage: number; hasMore: boolean }> => {
  let customers: PeopleVineCustomer[] = [];
  let pageNumber = startPage;
  const pageSize = 100;
  let consecutiveErrors = 0;
  let hadErrors = false;
  let lastPage = startPage;
  let hasMore = false;
  let pagesProcessed = 0;
  do {
    if (maxPages && pagesProcessed >= maxPages) {
      hasMore = true;
      break;
    }
    let retrievedCustomers: PeopleVineCustomer[];
    let attempt = 0;
    let success = false;
    let lastErr: unknown;
    while (attempt < 3) {
      try {
        retrievedCustomers = await apiRequest(c, {
          tokenType: PeopleVineTokenType.USER_COMPANY,
          endpoint: '/customers',
          method: 'GET',
          queryParams: {
            page_size: pageSize.toString(),
            page_number: pageNumber.toString(),
          },
        });
        success = true;
        break;
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt < 3) await sleep(1000 * attempt);
      }
    }
    if (!success) {
      console.warn(`[customers] page ${pageNumber} failed after 3 attempts: ${lastErr}`);
      hadErrors = true;
      pageNumber++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      continue;
    }
    consecutiveErrors = 0;
    customers = customers.concat(retrievedCustomers!);
    lastPage = pageNumber;
    pagesProcessed++;
    console.log(`Fetched ${retrievedCustomers!.length} customers from page ${pageNumber}`);
    if (onPageFetched) await onPageFetched(pageNumber);
    pageNumber++;
    if (retrievedCustomers!.length === 0 || retrievedCustomers!.length < pageSize) break;
  } while (true);
  return { customers: normalizeCustomers(customers), hadErrors, lastPage, hasMore };
};

const getCustomer = async (c: Context, peopleVineId: string): Promise<PeopleVineCustomer | null> => {
  const customer: PeopleVineCustomer = await apiRequest(c, {
    tokenType: PeopleVineTokenType.USER_COMPANY,
    endpoint: `/customers/${peopleVineId}`,
    method: 'GET',
  });
  const normalizedCustomers = normalizeCustomers([customer]);
  if (normalizedCustomers.length === 0) {
    return null;
  }
  return normalizedCustomers[0];
};

export const getSubscriptionSample = async (c: Context): Promise<{ subKeys: string[]; sub: any; customerKeys: string[]; customer: any }> => {
  const subs = await apiRequest(c, {
    tokenType: PeopleVineTokenType.USER_COMPANY,
    endpoint: '/subscriptions',
    method: 'GET',
    queryParams: { status: 'active', page_size: '1', page_number: '1' },
  });
  const sub = Array.isArray(subs) ? subs[0] : subs;
  const customer = sub?.customer ?? null;
  return {
    subKeys: sub ? Object.keys(sub) : [],
    sub,
    customerKeys: customer ? Object.keys(customer) : [],
    customer,
  };
};

const isUniqueConstraintError = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message.toLowerCase() : '';
  return msg.includes('already exists') || msg.includes('unique constraint') || (e as any)?.code === 'P2002';
};

export class SyncCancelledError extends Error {
  constructor() { super('SYNC_CANCELLED'); this.name = 'SyncCancelledError'; }
}

export const checkCancelled = async (prisma: PrismaClient, sessionId: string | undefined): Promise<void> => {
  if (!sessionId) return;
  const session = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { status: true } }).catch(() => null);
  if (session?.status === 'cancelled') throw new SyncCancelledError();
};

// --- Phase-based sync (splits subrequests across multiple queue jobs) ---

export const syncPhaseCompanies = async (c: Context, sessionId?: string): Promise<{ hadErrors: boolean }> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  await flush(5, 'Fetching subscriptions');
  log('info', 'Retrieving PeopleVine subscription data');

  const { customers: subCustomers, hadErrors, subscriptionInfoMap, individualSubscriberIds } = await getCustomersFromSubscriptions(c);
  const companyProfilesMap = new Map<string, PeopleVineCustomer>();
  for (const cu of subCustomers) companyProfilesMap.set(cu.id.toString(), cu);

  const dbCompanies = await prisma.company.findMany();
  const dbCompaniesMap = new Map<string, Company>();
  const dbCompaniesByName = new Map<string, Company>();
  for (const co of dbCompanies) {
    if (co.peopleVineId) dbCompaniesMap.set(co.peopleVineId, co);
    dbCompaniesByName.set(co.name.trim().toLowerCase(), co);
  }

  await flush(20, 'Syncing companies');
  log('info', 'Syncing companies');

  await runConcurrent(Array.from(companyProfilesMap.values()), 20, async (customer) => {
    const pvId = customer.id.toString();
    const subInfo = subscriptionInfoMap.get(pvId);
    const membershipType = subInfo?.membershipType ?? null;
    const isPersonal = customer.isPersonal ?? false;
    const isActive = subInfo?.isActive ?? false;
    const existingById = dbCompaniesMap.get(pvId);
    const existingByName = dbCompaniesByName.get(customer.company_name.trim().toLowerCase());
    const existing = existingById ?? existingByName;
    if (existing) {
      if (!existing.peopleVineId || existing.peopleVineId !== pvId) {
        log('info', `Merging duplicate company "${customer.company_name}" — assigning real PV ID.`);
      }
      await updateCompany(c, { id: existing.id, name: customer.company_name, active: isActive, membershipType, isPersonal, peopleVineId: pvId });
    } else {
      await createCompany(c, { name: customer.company_name, peopleVineId: pvId, active: isActive, email: customer.email.toLowerCase(), membershipType, isPersonal });
    }
  });

  const subscriberMemberships: Record<string, string | null> = {};
  for (const [pvId, info] of subscriptionInfoMap.entries()) {
    subscriberMemberships[pvId] = info.membershipType;
  }

  await saveMeta({
    companiesDone: true,
    activePVCompanyIds: Array.from(companyProfilesMap.keys()),
    activePVSubscriberIds: Array.from(individualSubscriberIds),
    subscriberMemberships,
    lastCustomerPage: 0,
    companyHadErrors: hadErrors,
  });
  await flush(30, 'Companies synced — queuing user sync');
  log('info', 'Companies sync complete. User sync queued.');

  return { hadErrors };
};

const BATCH_PAGES = 10;

export const syncPhaseUsers = async (
  c: Context,
  sessionId?: string,
  startPage = 1,
): Promise<{ hadErrors: boolean; hasMore: boolean; lastPage: number }> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  await flush(35, `Fetching customers (page ${startPage}+)`);
  log('info', 'Loading companies from database');

  const dbCompanies = await prisma.company.findMany();
  const companiesByNameMap = new Map<string, Company>();
  for (const co of dbCompanies) {
    if (companiesByNameMap.has(co.name)) {
      log('warn', `[sync] Duplicate company name: "${co.name}" — IDs ${companiesByNameMap.get(co.name)!.id} and ${co.id}.`);
    }
    companiesByNameMap.set(co.name, co);
  }

  log('info', `Retrieving customers from PeopleVine (pages ${startPage}–${startPage + BATCH_PAGES - 1})`);
  const { customers: batchCustomers, hadErrors, lastPage, hasMore } = await getCustomers(
    c, startPage, BATCH_PAGES, (page) => saveMeta({ lastCustomerPage: page }),
  );
  const batchCustomersMap = new Map<string, PeopleVineCustomer>();
  for (const cu of batchCustomers) batchCustomersMap.set(cu.id.toString(), cu);

  // Load all existing users by both peopleVineId and email for safe upsert
  const existingUsers = await prisma.user.findMany();
  const byPvId = new Map<string, User>();
  const byEmail = new Map<string, User>();
  for (const u of existingUsers) {
    if (u.peopleVineId) byPvId.set(u.peopleVineId, u);
    byEmail.set(u.email, u);
  }

  const sessionForMeta = sessionId ? await prisma.syncSession.findUnique({ where: { id: sessionId } }) : null;
  const sessionMeta: Record<string, any> = sessionForMeta ? JSON.parse(sessionForMeta.metadata ?? '{}') : {};
  const activePVSubscriberIds = new Set<string>(sessionMeta.activePVSubscriberIds ?? []);
  const subscriberMemberships: Record<string, string | null> = sessionMeta.subscriberMemberships ?? {};

  await flush(70, 'Syncing users');
  log('info', 'Syncing users');

  await runConcurrent(Array.from(batchCustomersMap.values()), 20, async (customer) => {
    const pvId = customer.id.toString();
    let company = companiesByNameMap.get(customer.company_name);

    if (company && !company.active && activePVSubscriberIds.has(pvId)) {
      company = undefined;
    }

    if (!company) {
      if (!activePVSubscriberIds.has(pvId)) return;
      const companyName = customer.company_name || `${customer.full_name}'s Company`;
      company = await prisma.company.findFirst({ where: { name: companyName } }) ?? undefined;
      if (!company) {
        const membershipType = subscriberMemberships[pvId] ?? null;
        try {
          company = await createCompany(c, {
            name: companyName,
            peopleVineId: pvId,
            active: true,
            email: customer.email.toLowerCase(),
            membershipType,
            isPersonal: true,
          });
        } catch {
          company = await prisma.company.findFirst({ where: { OR: [{ peopleVineId: pvId }, { name: companyName }] } }) ?? undefined;
          if (!company) return;
        }
      }
    }

    const existingByPvId = byPvId.get(pvId);
    const existingByEmail = byEmail.get(customer.email.toLowerCase());
    const existingUser = existingByPvId ?? existingByEmail;
    const pvUserActive = (customer.pvActive ?? true) && (company.active !== false);

    if (existingUser) {
      const needsUpdate =
        existingUser.name !== customer.full_name ||
        existingUser.email !== customer.email.toLowerCase() ||
        existingUser.companyId !== company.id ||
        existingUser.membershipType !== company.membershipType ||
        existingUser.active !== pvUserActive ||
        existingUser.profilePhoto !== (customer.profilePhoto ?? null) ||
        existingUser.username !== (customer.username ? customer.username.trim().toLowerCase() : null) ||
        (existingByEmail && !existingByEmail.peopleVineId) ||
        existingUser.phone !== (customer.phone ?? null) ||
        existingUser.address !== (customer.address ?? null) ||
        existingUser.city !== (customer.city ?? null) ||
        existingUser.state !== (customer.state ?? null) ||
        existingUser.zipCode !== (customer.zipCode ?? null) ||
        existingUser.cardStatus !== (customer.cardStatus ?? null);
      if (needsUpdate) {
        log('info', `Updating user ${customer.full_name} (${customer.email}).`);
        try {
          await updateUser(c, {
            id: existingUser.id,
            name: customer.full_name,
            email: customer.email,
            username: customer.username ?? null,
            companyId: company.id,
            peopleVineId: pvId,
            membershipType: company.membershipType,
            profilePhoto: customer.profilePhoto,
            active: pvUserActive,
            phone: customer.phone ?? null,
            address: customer.address ?? null,
            city: customer.city ?? null,
            state: customer.state ?? null,
            zipCode: customer.zipCode ?? null,
            cardStatus: customer.cardStatus ?? null,
          });
        } catch (e) {
          if (isUniqueConstraintError(e)) return;
          throw e;
        }
      }
      return;
    }

    try {
      await createUser(c, {
        name: customer.full_name,
        email: customer.email,
        username: customer.username ?? null,
        peopleVineId: pvId,
        role: Role.USER,
        companyId: company.id,
        membershipType: company.membershipType,
        profilePhoto: customer.profilePhoto,
        active: pvUserActive,
        phone: customer.phone ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
        zipCode: customer.zipCode ?? null,
        cardStatus: customer.cardStatus ?? null,
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) return;
      throw e;
    }
  });

  // Accumulate active PV user IDs across batches in session metadata
  if (sessionId) {
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
    const meta = session ? JSON.parse(session.metadata ?? '{}') : {};
    const existing: string[] = meta.activePVUserIds ?? [];
    await saveMeta({
      activePVUserIds: [...existing, ...Array.from(batchCustomersMap.keys())],
      usersDone: !hasMore,
      userHadErrors: hadErrors || (meta.userHadErrors === true),
    });
  }

  await flush(hasMore ? 75 : 90, hasMore ? `Users batch done — fetching next pages` : 'Users synced', 'running');
  log('info', hasMore ? `Batch done (pages ${startPage}–${lastPage}). Queuing next batch from page ${lastPage + 1}.` : 'Users sync complete.');

  return { hadErrors, hasMore, lastPage };
};

export const syncPhaseDeactivate = async (c: Context, sessionId?: string): Promise<void> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush } = makeSessionFlusher(prisma, sessionId);

  await flush(92, 'Deactivating removed records');

  const session = sessionId ? await prisma.syncSession.findUnique({ where: { id: sessionId } }) : null;
  const meta: Record<string, any> = session ? JSON.parse(session.metadata ?? '{}') : {};

  if (meta.companyHadErrors || meta.userHadErrors) {
    log('warn', '[sync] Skipping deactivation — previous phase had errors.');
    log('info', 'PeopleVine synchronization complete (deactivation skipped).');
    await flush(100, 'Complete', 'completed');
    if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
    return;
  }

  const activePVCompanyIds: string[] = meta.activePVCompanyIds ?? [];
  const activePVUserIds: string[] = meta.activePVUserIds ?? [];
  const activePVSubscriberIds = new Set<string>(meta.activePVSubscriberIds ?? []);

  if (activePVCompanyIds.length === 0 && activePVUserIds.length === 0) {
    log('warn', '[sync] No active PV IDs in session metadata, skipping deactivation.');
    await flush(100, 'Complete', 'completed');
    if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
    return;
  }

  log('info', 'Deactivating removed companies and users');

  if (activePVCompanyIds.length > 0) {
    const activePVCompanySet = new Set(activePVCompanyIds);
    const dbCompanies = await prisma.company.findMany();
    await runConcurrent(dbCompanies, 20, async (co) => {
      if (co.peopleVineId && !activePVCompanySet.has(co.peopleVineId)) await deactivateCompany(c, co.id);
    });
  }

  if (activePVUserIds.length > 0) {
    const activePVUserSet = new Set(activePVUserIds);
    const existingUsers = await prisma.user.findMany();
    await runConcurrent(existingUsers, 20, async (u) => {
      if (u.peopleVineId && !activePVUserSet.has(u.peopleVineId)) {
        // Suggestion 5: keep active if user still holds any individual subscription
        if (activePVSubscriberIds.has(u.peopleVineId)) return;
        await deactivateUser(c, u.id);
      }
    });
  }

  log('info', 'PeopleVine synchronization complete.');
  await flush(100, 'Complete', 'completed');
  if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
};

export const syncOne = async (c: Context, peopleVineId: number, webhookLogId?: string): Promise<void> => {
  const prisma: PrismaClient = c.get('db');

  console.log(`Syncing customer with PeopleVine ID ${peopleVineId}`);
  const [customer, subResult] = await Promise.all([
    getCustomer(c, peopleVineId.toString()),
    getCustomersFromSubscriptions(c, peopleVineId.toString()),
  ]);

  if (!customer) {
    console.log(`Customer with PeopleVine ID ${peopleVineId} not found.`);
    return;
  }

  const pvId = customer.id.toString();
  const hasSubInfo = subResult.subscriptionInfoMap.has(pvId);
  const subInfo = subResult.subscriptionInfoMap.get(pvId);
  const membershipType = subInfo?.membershipType ?? null;
  const isPersonal = customer.isPersonal ?? false;
  const diffRecord: Record<string, { before: any; after: any }> = {};

  const existingCompanyByPvId = await prisma.company.findFirst({ where: { peopleVineId: pvId } });
  const existingCompanyByName = await prisma.company.findFirst({ where: { name: customer.company_name } });

  // A customer is a company representative if our DB already links a company to their PV ID,
  // or if PeopleVine returned a company-level subscription for them.
  // Sub-members belong to a company but hold no company-level subscription of their own.
  const hasCompanyLevelSub = subResult.customers.some(cu => cu.id.toString() === pvId);
  const isCompanyRep = existingCompanyByPvId !== null || hasCompanyLevelSub;

  // Company reps must have an active subscription to remain active.
  // Sub-members rely only on their customer profile status — their personal subscriptions
  // (e.g. parking, equipment) must not affect portal access or company state.
  const pvActive = (isCompanyRep && subInfo)
    ? ((customer.pvActive ?? true) && subInfo.isActive)
    : (customer.pvActive ?? true);

  // A name-matched company with no PV ID is treated as the rep's unlinked company —
  // we will set its PV ID during the update. A name-matched company that already has
  // a different PV ID belongs to someone else and must not be touched.
  const nameFoundIsRep = existingCompanyByName && !existingCompanyByName.peopleVineId;
  const repCompanyCandidate = existingCompanyByPvId ?? (nameFoundIsRep ? existingCompanyByName : null);

  // If the customer moved from a deactivated company account to a personal subscription,
  // don't reactivate the old company — create a fresh personal account instead.
  const movingToPersonal = repCompanyCandidate && !repCompanyCandidate.active && isPersonal && !repCompanyCandidate.isPersonal;
  const companyForRepOps = movingToPersonal ? null : repCompanyCandidate;

  // Company deactivation/update only applies to the company this customer represents.
  // Never mutate a company based on a sub-member's subscription state.
  if (isCompanyRep) {
    if (!pvActive && companyForRepOps && companyForRepOps.active) {
      console.log(`Customer ${customer.id} has no active subscription. Deactivating company ${companyForRepOps.name}.`);
      diffRecord.company = { before: { active: true }, after: { active: false } };
      if (webhookLogId) {
        await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify(diffRecord) } }).catch(() => {});
      }
      await deactivateCompany(c, companyForRepOps.id);
      return;
    }

    if (companyForRepOps) {
      console.log(`Updating company ${companyForRepOps.name}.`);
      const wasInactive = !companyForRepOps.active;
      diffRecord.company = {
        before: { name: companyForRepOps.name, active: companyForRepOps.active, membershipType: companyForRepOps.membershipType, isPersonal: companyForRepOps.isPersonal },
        after: { name: customer.company_name, active: pvActive, membershipType: hasSubInfo ? membershipType : companyForRepOps.membershipType, isPersonal },
      };
      await updateCompany(c, {
        id: companyForRepOps.id,
        name: customer.company_name,
        active: pvActive,
        membershipType: hasSubInfo ? membershipType : companyForRepOps.membershipType,
        isPersonal,
        peopleVineId: pvId,
      });
      if (wasInactive && pvActive) {
        console.log(`Reactivating users for company ${companyForRepOps.name}.`);
        await prisma.user.updateMany({ where: { companyId: companyForRepOps.id }, data: { active: true } });
      }
    }
  }

  const baseCompany = movingToPersonal ? null : (repCompanyCandidate ?? existingCompanyByName);
  let associatedCompany = baseCompany ?? await prisma.company.findFirst({ where: { name: customer.company_name } });
  if (!associatedCompany) {
    // Only company reps with an active subscription can create a new company record.
    // Sub-members must belong to an existing company — if none found, skip.
    if (!isCompanyRep || !pvActive) {
      console.log(`No company found for ${customer.full_name} — sub-member or inactive, skipping.`);
      return;
    }
    console.log(`Creating new company for ${customer.company_name}.`);
    diffRecord.company = {
      before: null,
      after: { name: customer.company_name, active: true, membershipType, isPersonal },
    };
    try {
      associatedCompany = await createCompany(c, {
        name: customer.company_name,
        peopleVineId: pvId,
        active: true,
        email: customer.email.toLowerCase(),
        membershipType,
        isPersonal,
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        associatedCompany = await prisma.company.findFirst({ where: { OR: [{ peopleVineId: pvId }, { name: customer.company_name }] } });
        if (!associatedCompany) return;
      } else {
        throw e;
      }
    }
  }

  // Sub-members inherit the company's membershipType; subscription holders use their own.
  const userMembershipType = membershipType ?? associatedCompany.membershipType;

  const userByPvId = await prisma.user.findFirst({ where: { peopleVineId: customer.id.toString() } });
  const userByEmail = await prisma.user.findFirst({ where: { email: customer.email.toLowerCase() } });
  const associatedUser = userByPvId ?? userByEmail;

  if (associatedUser) {
    const needsUpdate =
      associatedUser.name !== customer.full_name ||
      associatedUser.email !== customer.email.toLowerCase() ||
      associatedUser.username !== (customer.username ? customer.username.trim().toLowerCase() : null) ||
      associatedUser.companyId !== associatedCompany.id ||
      associatedUser.membershipType !== userMembershipType ||
      associatedUser.active !== pvActive ||
      associatedUser.profilePhoto !== (customer.profilePhoto ?? null) ||
      associatedUser.phone !== (customer.phone ?? null) ||
      associatedUser.address !== (customer.address ?? null) ||
      associatedUser.city !== (customer.city ?? null) ||
      associatedUser.state !== (customer.state ?? null) ||
      associatedUser.zipCode !== (customer.zipCode ?? null) ||
      associatedUser.cardStatus !== (customer.cardStatus ?? null) ||
      (userByEmail && !userByEmail.peopleVineId);
    const userAfterSnapshot = {
      name: customer.full_name,
      email: customer.email.toLowerCase(),
      username: customer.username ? customer.username.trim().toLowerCase() : null,
      active: pvActive,
      membershipType: userMembershipType,
      phone: customer.phone ?? null,
      address: customer.address ?? null,
      city: customer.city ?? null,
      state: customer.state ?? null,
      zipCode: customer.zipCode ?? null,
      cardStatus: customer.cardStatus ?? null,
      profilePhoto: customer.profilePhoto ?? null,
    };
    if (needsUpdate) {
      console.log(`Updating user ${customer.full_name} (${customer.email}).`);
      diffRecord.user = {
        before: {
          name: associatedUser.name,
          email: associatedUser.email,
          username: associatedUser.username,
          active: associatedUser.active,
          membershipType: associatedUser.membershipType,
          phone: associatedUser.phone,
          address: associatedUser.address,
          city: associatedUser.city,
          state: associatedUser.state,
          zipCode: associatedUser.zipCode,
          cardStatus: associatedUser.cardStatus,
          profilePhoto: associatedUser.profilePhoto,
        },
        after: userAfterSnapshot,
      };
      await updateUser(c, {
        id: associatedUser.id,
        name: customer.full_name,
        email: customer.email,
        username: customer.username ?? null,
        companyId: associatedCompany.id,
        peopleVineId: customer.id.toString(),
        membershipType: userMembershipType,
        profilePhoto: customer.profilePhoto,
        active: pvActive,
        phone: customer.phone ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
        zipCode: customer.zipCode ?? null,
        cardStatus: customer.cardStatus ?? null,
      });
    } else {
      diffRecord.user = { before: userAfterSnapshot, after: userAfterSnapshot };
    }
  } else {
    if (!pvActive) {
      console.log(`User ${customer.full_name} is inactive, skipping creation.`);
      return;
    }
    console.log(`Creating user for ${customer.full_name} (${customer.email}).`);
    diffRecord.user = {
      before: null,
      after: {
        name: customer.full_name,
        email: customer.email.toLowerCase(),
        username: customer.username ?? null,
        active: pvActive,
        phone: customer.phone ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
        zipCode: customer.zipCode ?? null,
        cardStatus: customer.cardStatus ?? null,
        profilePhoto: customer.profilePhoto ?? null,
      },
    };
    try {
      await createUser(c, {
        name: customer.full_name,
        email: customer.email,
        username: customer.username ?? null,
        peopleVineId: customer.id.toString(),
        role: Role.USER,
        companyId: associatedCompany.id,
        membershipType: userMembershipType,
        profilePhoto: customer.profilePhoto,
        active: pvActive,
        phone: customer.phone ?? null,
        address: customer.address ?? null,
        city: customer.city ?? null,
        state: customer.state ?? null,
        zipCode: customer.zipCode ?? null,
        cardStatus: customer.cardStatus ?? null,
      });
    } catch (e) {
      if (isUniqueConstraintError(e)) return;
      throw e;
    }
  }

  diffRecord.subscription = {
    before: {
      membershipType: hasSubInfo ? (subInfo?.membershipType ?? null) : '(no data)',
      isActive: hasSubInfo ? (subInfo?.isActive ?? false) : '(no data)',
    },
    after: {
      membershipType: hasSubInfo ? (subInfo?.membershipType ?? null) : '(no data)',
      isActive: hasSubInfo ? (subInfo?.isActive ?? false) : '(no data)',
    },
  };

  if (webhookLogId && Object.keys(diffRecord).length > 0) {
    await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify(diffRecord) } }).catch(() => {});
  }

  console.log(`Sync for customer with PeopleVine ID ${peopleVineId} complete.`);
}

interface CompanyImport {
  subscriptionNo: string;
  companyName: string;
  membershipType: string | null;
}

interface MemberImport {
  customerNo: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  username: string | null;
}

export const syncFiltered = async (
  c: Context,
  companies: CompanyImport[],
  members: MemberImport[],
  sessionId?: string,
): Promise<{ companiesCreated: number; errors: string[] }> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  try {
    log('info', `Starting filtered import: ${companies.length} companies, ${members.length} members`);
    await flush(5, 'Creating companies');

    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const errors: string[] = [];
    let companiesCreated = 0;

    // ── Phase 1a: Create all companies from import file (no PV API needed) ──
    const existingDbCos = await prisma.company.findMany({ select: { id: true, name: true, peopleVineId: true } });
    const existingByNormName = new Map<string, { id: string; peopleVineId: string | null }>(
      existingDbCos.map(co => [normalize(co.name), { id: co.id, peopleVineId: co.peopleVineId }])
    );

    let companiesDone = 0;
    for (const co of companies) {
      await checkCancelled(prisma, sessionId);

      const key = normalize(co.companyName);
      if (!existingByNormName.has(key)) {
        try {
          const created = await createCompany(c, {
            name: co.companyName,
            peopleVineId: null,
            active: true,
            email: `placeholder-${crypto.randomUUID()}@placeholder.invalid`,
            membershipType: co.membershipType,
            isPersonal: false,
          });
          existingByNormName.set(key, { id: created.id, peopleVineId: null });
          companiesCreated++;
        } catch (e) {
          if (!isUniqueConstraintError(e)) {
            errors.push(`Company "${co.companyName}": ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      companiesDone++;
      if (companiesDone % 50 === 0) {
        log('info', `Companies created: ${companiesDone}/${companies.length}`);
        await flush(5 + Math.round((companiesDone / companies.length) * 20), 'Creating companies');
      }
    }

    log('info', `Companies phase 1 complete: ${companiesCreated} created, ${companies.length - companiesCreated} already existed`);
    await flush(25, 'Enriching companies with PeopleVine data');

    // ── Phase 1b: Enrich with PeopleVine IDs via subscription lookup ──
    let subsDone = 0;
    for (const co of companies) {
      await checkCancelled(prisma, sessionId);

      const key = normalize(co.companyName);
      const existing = existingByNormName.get(key);
      if (!existing || existing.peopleVineId || !co.subscriptionNo) { subsDone++; continue; }

      let sub: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          sub = await apiRequest(c, {
            tokenType: PeopleVineTokenType.USER_COMPANY,
            endpoint: `/subscriptions/${co.subscriptionNo}`,
            method: 'GET',
          });
          break;
        } catch (err) {
          if (attempt < 2) await sleep(1000 * (attempt + 1));
        }
      }

      if (sub?.customer) {
        const pvId = String(sub.customer.id);
        try {
          await prisma.company.update({ where: { id: existing.id }, data: { peopleVineId: pvId } });
          existing.peopleVineId = pvId;
        } catch {}
      }

      subsDone++;
      if (subsDone % 50 === 0) {
        log('info', `PV enrichment: ${subsDone}/${companies.length}`);
        await flush(25 + Math.round((subsDone / companies.length) * 20), 'Enriching with PeopleVine data');
      }
    }

    log('info', `Companies complete. Queuing ${members.length} members for batch import.`);
    await saveMeta({ totalUsersCreated: 0, totalUsersSkipped: 0 });
    await flush(50, 'Companies complete — queuing member import');

    return { companiesCreated, errors };
  } catch (err) {
    if (err instanceof SyncCancelledError) {
      return { companiesCreated: 0, errors: [] };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[syncFiltered] Fatal error: ${msg}`);
    if (sessionId) {
      try {
        const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
        const existingLogs: LogEntry[] = session ? JSON.parse(session.logs) : [];
        existingLogs.push({ time: new Date().toISOString(), level: 'error', message: `Import failed: ${msg}` });
        await prisma.syncSession.update({ where: { id: sessionId }, data: { status: 'failed', step: 'Failed', logs: JSON.stringify(existingLogs), completedAt: new Date() } });
      } catch {}
    }
    throw err;
  }
}

const FILTERED_MEMBER_BATCH = 300;

export const syncFilteredMembers = async (
  c: Context,
  sessionId: string,
  startOffset: number,
): Promise<{ hasMore: boolean; nextOffset: number }> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  await checkCancelled(prisma, sessionId);

  const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
  const meta: Record<string, any> = session?.metadata ? JSON.parse(session.metadata) : {};
  const members: MemberImport[] = meta.members ?? [];
  const total = members.length;

  const batch = members.slice(startOffset, startOffset + FILTERED_MEMBER_BATCH);
  const nextOffset = startOffset + FILTERED_MEMBER_BATCH;
  const hasMore = nextOffset < total;

  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const dbCos = await prisma.company.findMany({ select: { id: true, name: true, membershipType: true } });
  const dbCoByNormName = new Map(dbCos.map(co => [normalize(co.name), co]));

  let usersCreated = 0;
  let usersSkipped = 0;

  for (const m of batch) {
    await checkCancelled(prisma, sessionId);

    const companyKey = normalize(m.companyName);
    const dbCompany = dbCoByNormName.get(companyKey);
    if (!dbCompany) { usersSkipped++; continue; }

    const email = m.email?.toLowerCase();
    if (!email) { usersSkipped++; continue; }

    const fullName = [m.firstName, m.lastName].filter(Boolean).join(' ') || email.split('@')[0];

    try {
      await createUser(c, {
        name: fullName,
        email,
        username: m.username ?? null,
        peopleVineId: m.customerNo,
        role: Role.USER,
        companyId: dbCompany.id,
        active: true,
        membershipType: dbCompany.membershipType,
        profilePhoto: null,
      });
      usersCreated++;
    } catch (e) {
      if (isUniqueConstraintError(e)) {
        usersSkipped++;
      }
    }
  }

  const runningCreated = (meta.totalUsersCreated ?? 0) + usersCreated;
  const runningSkipped = (meta.totalUsersSkipped ?? 0) + usersSkipped;
  await saveMeta({ totalUsersCreated: runningCreated, totalUsersSkipped: runningSkipped });

  const doneCount = Math.min(nextOffset, total);
  log('info', `Members progress: ${doneCount}/${total}`);

  if (hasMore) {
    await flush(50 + Math.round((doneCount / total) * 45), 'Creating members');
  } else {
    log('info', `Import complete: ${runningCreated} users created, ${runningSkipped} skipped`);
    await flush(100, 'Complete', 'completed');
    await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
  }

  return { hasMore, nextOffset };
}