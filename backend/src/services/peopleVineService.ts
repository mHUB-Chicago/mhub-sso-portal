import { Context } from 'hono';
import { Company, PeopleVineToken, PeopleVineTokenType, PrismaClient, Role, User } from '@prisma/client';
import { createCompany, deactivateCompany, updateCompany } from './companyService';
import { createUser, deactivateUser, updateUser } from './userService';

const PEOPLEVINE_API_BASE_URL = 'https://api.peoplevine.dev/api';

interface RequestOptions {
  tokenType: PeopleVineTokenType;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  queryParams?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
}

export interface PeopleVineCustomer {
  id: number;
  company_name: string;
  full_name: string;
  email: string;
  // other fields are available but omitted for brevity and type safety
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
    if (sessionId) logs.push({ time: new Date().toISOString(), level, message });
  };

  const flush = async (progress: number, step: string, status = 'running') => {
    if (!sessionId) return;
    try {
      await prisma.syncSession.update({
        where: { id: sessionId },
        data: { progress, step, status, logs: JSON.stringify(logs), metadata: JSON.stringify(meta) },
      });
    } catch (e) {
      console.error('Failed to update sync session:', e);
    }
  };

  const saveMeta = async (patch: Record<string, unknown>) => {
    if (!sessionId) return;
    meta = { ...meta, ...patch };
    try {
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
  const userToken = userTokenRecord.accessToken;
  const userRefreshToken = userTokenRecord.refreshToken;
  const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'access_token',
      company_id: companyId,
      access_token: userToken,
      refresh_token: userRefreshToken,
      remember_me: true,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    const errorStatus = response.status;
    console.error(`Error response (${errorStatus}): ${errorText}`);
    throw new Error('Failed to obtain user company auth token');
  }
  const responseData: any = await response.json();
  const accessToken = responseData.access_token;
  const expiresIn = responseData.expires_in;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const refreshToken = responseData.refresh_token;
  return setToken(c, PeopleVineTokenType.USER_COMPANY, accessToken, refreshToken, expiresAt);
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
  const { endpoint, method, body, headers, queryParams } = options;
  const queryString = queryParams
    ? '?' + new URLSearchParams(queryParams).toString()
    : '';
  const authTokenRecord: PeopleVineToken = await getAuthToken(c, options.tokenType);
  const authToken: string = authTokenRecord.accessToken;
  const baseUrl = PEOPLEVINE_API_BASE_URL;
  const fullUrl = `${baseUrl}${endpoint}${queryString}`;
  console.log(`[PeopleVine] ${method} ${fullUrl}`);
  const fetchInit: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(headers || {}),
    },
  };
  if (body) {
    fetchInit.body = JSON.stringify(body);
  }
  const response = await fetch(fullUrl, fetchInit);
  if (!response.ok) {
    const resText = await response.text();
    const status = response.status;
    let errorDetails = resText;
    try {
      const resJson = JSON.parse(resText);
      errorDetails = JSON.stringify(resJson, null, 2);
    } catch {}
    throw new Error(`API request failed with status ${status}\n${errorDetails}`);
  }
  return response.json();
}

const normalizeCustomers = (customers: PeopleVineCustomer[]): PeopleVineCustomer[] => {
  return customers.map((customer) => {
    let companyName = customer.company_name.trim();
    if (companyName.length === 0) {
      companyName = customer.full_name.trim().concat("'s Company");
    }
    return ({
      ...customer,
      full_name: customer.full_name ? customer.full_name.trim() : customer.full_name,
      company_name: companyName,
      email: customer.email ? customer.email.toLowerCase() : customer.email,
    })
  }).filter((customer) => {
    return customer.full_name && customer.full_name.length > 0 && customer.email && customer.email.length > 0;
  });
}

const getCustomersFromSubscriptions = async (c: Context): Promise<{ customers: PeopleVineCustomer[]; hadErrors: boolean }> => {
  let subscriptions: any[] = [];
  let pageNumber = 1;
  const pageSize = 10;
  let consecutiveErrors = 0;
  let hadErrors = false;
  do {
    let retrievedSubscriptions: any[];
    try {
      retrievedSubscriptions = await apiRequest(c, {
        tokenType: PeopleVineTokenType.USER_COMPANY,
        endpoint: '/subscriptions',
        method: 'GET',
        queryParams: {
          status: 'active',
          page_size: pageSize.toString(),
          page_number: pageNumber.toString(),
        },
      });
      consecutiveErrors = 0;
    } catch (err) {
      console.warn(`[subscriptions] skipping page ${pageNumber} due to error: ${err}`);
      hadErrors = true;
      pageNumber++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      continue;
    }
    subscriptions = subscriptions.concat(retrievedSubscriptions);
    pageNumber++;
    if (retrievedSubscriptions.length === 0 || retrievedSubscriptions.length < pageSize) {
      break;
    }
  } while (true);
  let companies = subscriptions.map((sub: any) => sub?.customer || null).filter(Boolean)
  companies = Array.from(new Map(companies.map(company => [`${company.id}${company.company_name}`, company])).values());
  return { customers: normalizeCustomers(companies), hadErrors };
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
    try {
      retrievedCustomers = await apiRequest(c, {
        tokenType: PeopleVineTokenType.USER_COMPANY,
        endpoint: '/customers',
        method: 'GET',
        queryParams: {
          status: 'active',
          page_size: pageSize.toString(),
          page_number: pageNumber.toString(),
        },
      });
      consecutiveErrors = 0;
    } catch (err) {
      console.warn(`[customers] skipping page ${pageNumber} due to error: ${err}`);
      hadErrors = true;
      pageNumber++;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      continue;
    }
    customers = customers.concat(retrievedCustomers);
    lastPage = pageNumber;
    pagesProcessed++;
    console.log(`Fetched ${retrievedCustomers.length} customers from page ${pageNumber}`);
    if (onPageFetched) await onPageFetched(pageNumber);
    pageNumber++;
    if (retrievedCustomers.length === 0 || retrievedCustomers.length < pageSize) break;
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

export const syncAll = async (c: Context, sessionId?: string): Promise<void> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  try {
  await flush(5, 'Starting sync');

  //
  // Step 1: Sync companies based on PeopleVine customers
  //

  log('info', 'Retrieving PeopleVine data');
  // Fetch customers from PeopleVine which have active subscriptions
  const { customers: peopleVineCustomersFromSubscriptions, hadErrors: subscriptionFetchHadErrors } = await getCustomersFromSubscriptions(c);
  // Create a map of PeopleVine companies by their PeopleVine ID for easy lookup
  let companyProfilesMap: Map<string, PeopleVineCustomer> = new Map();
  for (const company of peopleVineCustomersFromSubscriptions) {
    companyProfilesMap.set(company.id.toString(), company);
  }

  // Fetch all companies from our database
  let dbCompanies = await prisma.company.findMany();

  // Create a map of DB companies by their PeopleVine ID for easy lookup
  let dbCompaniesMap: Map<string, Company> = new Map();
  for (const dbCompany of dbCompanies) {
    if (dbCompany.peopleVineId) {
      dbCompaniesMap.set(dbCompany.peopleVineId, dbCompany);
    }
  }

  await flush(20, 'Syncing companies');
  log('info', 'Syncing companies');

  // Process each PeopleVine company and create or update companies accordingly
  await Promise.all(companyProfilesMap.values().map(async (customer) => {
    const peopleVineId = customer.id.toString();
    const existingCompany = dbCompaniesMap.get(peopleVineId);

    if (existingCompany) {
      log('info', `Updating company for ${customer.company_name}.`);
      return updateCompany(c, {
        id: existingCompany.id,
        name: customer.company_name,
        active: true,
      });
    } else {
      log('info', `Creating company for ${customer.company_name}.`);
      return createCompany(c, {
        name: customer.company_name,
        peopleVineId: customer.id.toString(),
        active: true,
        email: customer.email.toLowerCase(),
      });
    }
  }));

  //
  // Step 2: Sync users based on PeopleVine customers
  //

  await saveMeta({ companiesDone: true, lastCustomerPage: 0 });
  await flush(40, 'Fetching users');
  log('info', 'Retrieving users');
  // Fetch companies again to get updated list with newly created ones
  dbCompanies = await prisma.company.findMany();
  const companiesByNameMap: Map<string, Company> = new Map();
  for (const company of dbCompanies) {
    if (companiesByNameMap.has(company.name)) {
      log('warn', `[sync] Duplicate company name detected: "${company.name}" — IDs ${companiesByNameMap.get(company.name)!.id} and ${company.id}. User assignments for this name may be incorrect.`);
    }
    companiesByNameMap.set(company.name, company);
  }

  // Fetch all customers from PeopleVine, saving checkpoint after each page
  const { customers: allPeopleVineCustomers, hadErrors: customerFetchHadErrors } = await getCustomers(
    c, 1, (page) => saveMeta({ lastCustomerPage: page }),
  );

  // Normalize and map customers by their PeopleVine ID
  const allCustomersMap: Map<string, PeopleVineCustomer> = new Map();
  for (const customer of allPeopleVineCustomers) {
    allCustomersMap.set(customer.id.toString(), customer);
  }

  // Fetch all existing users from our database
  let existingUsers = await prisma.user.findMany();

  // Create a map of existing users by their PeopleVine ID for easy lookup
  let existingUsersMap: Map<string, User> = new Map();
  for (const user of existingUsers) {
    if (user.peopleVineId) {
      existingUsersMap.set(user.peopleVineId, user);
    }
  }

  await flush(65, 'Syncing users');
  log('info', 'Syncing users');
  // Process each customer and create or update users accordingly
  await Promise.all(allCustomersMap.values().map(async (customer) => {
    const peopleVineId = customer.id.toString();
    const existingUser = existingUsersMap.get(peopleVineId);

    let associatedCompanyByName = companiesByNameMap.get(customer.company_name);
    if (!associatedCompanyByName) {
      // console.log(`No associated company found for user ${customer.full_name} (${customer.email}), skipping user creation.`);
      return;
    }

    if (existingUser && associatedCompanyByName.id !== existingUser.companyId) {
      // console.log(`User ${customer.full_name} (${customer.email}) is associated with a different company, updating company association.`);
      return updateUser(c, {
        id: existingUser.id,
        name: customer.full_name,
        email: customer.email,
        companyId: associatedCompanyByName.id,
      });
    }

    if (existingUser && associatedCompanyByName.id === existingUser.companyId) {
      // console.log(`User ${customer.full_name} (${customer.email}) already exists with correct company association.`);
      if (existingUser.name !== customer.full_name || existingUser.email !== customer.email.toLowerCase()) {
        log('info', `Updating user ${customer.full_name} (${customer.email}) details.`);
        return updateUser(c, {
          id: existingUser.id,
          name: customer.full_name,
          email: customer.email,
        });
      }
    }

    if (!existingUser) {
      // console.log(`Creating user for ${customer.full_name} (${customer.email}).`);
      return createUser(c, {
        name: customer.full_name,
        email: customer.email,
        peopleVineId: peopleVineId,
        role: Role.USER,
        companyId: associatedCompanyByName.id,
      });
    }
  }));

  //
  // Step 3: Deactivate any companies or users that no longer exist in PeopleVine
  //

  if (subscriptionFetchHadErrors || customerFetchHadErrors) {
    log('warn', '[sync] Skipping deactivation step — PeopleVine API returned errors during fetch.');
    log('info', 'PeopleVine synchronization complete (deactivation skipped due to fetch errors).');
    await flush(100, 'Complete', 'completed');
    if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
    return;
  }

  await flush(90, 'Deactivating removed records');
  log('info', 'deactivating removed companies and users');
  dbCompanies = await prisma.company.findMany();

  const activePeopleVineIdsForCompanies = new Set<string>(companyProfilesMap.keys());
  const activePeopleVineIdsForUsers = new Set<string>(allCustomersMap.keys());

  // Deactivate companies not in PeopleVine
  await Promise.all(dbCompanies.map(async (dbCompany) => {
    if (dbCompany.peopleVineId && !activePeopleVineIdsForCompanies.has(dbCompany.peopleVineId)) {
      // console.log(`Deactivating company ${dbCompany.name} as it no longer exists in PeopleVine.`);
      return deactivateCompany(c, dbCompany.id);
    }
  }));

  // Deactivate users not in PeopleVine
  existingUsers = await prisma.user.findMany();
  await Promise.all(existingUsers.map(async (user) => {
    if (user.peopleVineId && !activePeopleVineIdsForUsers.has(user.peopleVineId)) {
      // console.log(`Deactivating user ${user.name} (${user.email}) as they no longer exist in PeopleVine.`);
      return deactivateUser(c, user.id);
    }
  }));

  log('info', 'PeopleVine synchronization complete.');
  await flush(100, 'Complete', 'completed');
  if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Fatal error: ${msg}`);
    if (sessionId) {
      try {
        const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
        const existingLogs: LogEntry[] = session ? JSON.parse(session.logs) : [];
        existingLogs.push({ time: new Date().toISOString(), level: 'error', message: `Sync failed: ${msg}` });
        await prisma.syncSession.update({ where: { id: sessionId }, data: { status: 'failed', step: 'Failed', logs: JSON.stringify(existingLogs), completedAt: new Date() } });
      } catch {}
    }
    throw err;
  }
}

// --- Phase-based sync (splits subrequests across multiple queue jobs) ---

export const syncPhaseCompanies = async (c: Context, sessionId?: string): Promise<{ hadErrors: boolean }> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  await flush(5, 'Fetching subscriptions');
  log('info', 'Retrieving PeopleVine subscription data');

  const { customers: subCustomers, hadErrors } = await getCustomersFromSubscriptions(c);
  const companyProfilesMap = new Map<string, PeopleVineCustomer>();
  for (const cu of subCustomers) companyProfilesMap.set(cu.id.toString(), cu);

  const dbCompanies = await prisma.company.findMany();
  const dbCompaniesMap = new Map<string, Company>();
  for (const co of dbCompanies) { if (co.peopleVineId) dbCompaniesMap.set(co.peopleVineId, co); }

  await flush(20, 'Syncing companies');
  log('info', 'Syncing companies');

  await Promise.all(Array.from(companyProfilesMap.values()).map(async (customer) => {
    const existing = dbCompaniesMap.get(customer.id.toString());
    if (existing) {
      log('info', `Updating company for ${customer.company_name}.`);
      return updateCompany(c, { id: existing.id, name: customer.company_name, active: true });
    } else {
      log('info', `Creating company for ${customer.company_name}.`);
      return createCompany(c, { name: customer.company_name, peopleVineId: customer.id.toString(), active: true, email: customer.email.toLowerCase() });
    }
  }));

  await saveMeta({
    companiesDone: true,
    activePVCompanyIds: Array.from(companyProfilesMap.keys()),
    lastCustomerPage: 0,
    companyHadErrors: hadErrors,
  });
  await flush(30, 'Companies synced — queuing user sync');
  log('info', 'Companies sync complete. User sync queued.');

  return { hadErrors };
};

const BATCH_PAGES = 40;

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

  await flush(70, 'Syncing users');
  log('info', 'Syncing users');

  await Promise.all(Array.from(batchCustomersMap.values()).map(async (customer) => {
    const pvId = customer.id.toString();
    const company = companiesByNameMap.get(customer.company_name);
    if (!company) return;

    const existingByPvId = byPvId.get(pvId);
    const existingByEmail = byEmail.get(customer.email.toLowerCase());
    const existingUser = existingByPvId ?? existingByEmail;

    if (existingUser) {
      const needsUpdate =
        existingUser.name !== customer.full_name ||
        existingUser.email !== customer.email.toLowerCase() ||
        existingUser.companyId !== company.id ||
        (existingByEmail && !existingByEmail.peopleVineId);
      if (needsUpdate) {
        log('info', `Updating user ${customer.full_name} (${customer.email}).`);
        return updateUser(c, {
          id: existingUser.id,
          name: customer.full_name,
          email: customer.email,
          companyId: company.id,
          peopleVineId: pvId,
        });
      }
      return;
    }

    return createUser(c, {
      name: customer.full_name,
      email: customer.email,
      peopleVineId: pvId,
      role: Role.USER,
      companyId: company.id,
    });
  }));

  // Accumulate active PV user IDs across batches in session metadata
  if (sessionId) {
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
    const meta = session ? JSON.parse(session.metadata ?? '{}') : {};
    const existing: string[] = meta.activePVUserIds ?? [];
    await saveMeta({
      activePVUserIds: [...existing, ...Array.from(batchCustomersMap.keys())],
      usersDone: !hasMore,
      userHadErrors: hadErrors,
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
    await Promise.all(dbCompanies.map(async (co) => {
      if (co.peopleVineId && !activePVCompanySet.has(co.peopleVineId)) return deactivateCompany(c, co.id);
    }));
  }

  if (activePVUserIds.length > 0) {
    const activePVUserSet = new Set(activePVUserIds);
    const existingUsers = await prisma.user.findMany();
    await Promise.all(existingUsers.map(async (u) => {
      if (u.peopleVineId && !activePVUserSet.has(u.peopleVineId)) return deactivateUser(c, u.id);
    }));
  }

  log('info', 'PeopleVine synchronization complete.');
  await flush(100, 'Complete', 'completed');
  if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
};

export const syncContinue = async (c: Context, sessionId?: string): Promise<void> => {
  const prisma: PrismaClient = c.get('db');
  const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);

  try {
    await flush(5, 'Starting continue sync');

    // Find last ALL session to read checkpoint
    const lastSession = await prisma.syncSession.findFirst({
      where: { type: 'ALL', status: { in: ['failed', 'completed'] } },
      orderBy: { startedAt: 'desc' },
    });
    const lastMeta: Record<string, unknown> = lastSession ? JSON.parse(lastSession.metadata ?? '{}') : {};
    const resumeFromPage = typeof lastMeta.lastCustomerPage === 'number' ? lastMeta.lastCustomerPage + 1 : 1;

    if (resumeFromPage > 1) {
      log('info', `Resuming from customer page ${resumeFromPage} (last checkpoint: page ${resumeFromPage - 1})`);
    } else {
      log('info', 'No checkpoint found — fetching all customers from page 1');
    }

    // Skip subscription/company fetch — use existing DB companies
    log('info', 'Loading companies from database');
    const dbCompanies = await prisma.company.findMany();
    const companiesByNameMap = new Map<string, Company>();
    for (const co of dbCompanies) {
      if (companiesByNameMap.has(co.name)) {
        log('warn', `[sync] Duplicate company name: "${co.name}" — using latest.`);
      }
      companiesByNameMap.set(co.name, co);
    }

    await flush(15, 'Fetching customers');
    log('info', 'Retrieving customers from PeopleVine');
    const { customers: allCustomers, hadErrors: customerHadErrors } = await getCustomers(
      c, resumeFromPage, (page) => saveMeta({ lastCustomerPage: page }),
    );
    const allCustomersMap = new Map<string, PeopleVineCustomer>();
    for (const cu of allCustomers) allCustomersMap.set(cu.id.toString(), cu);

    await flush(55, 'Syncing users');
    let existingUsers = await prisma.user.findMany();
    const existingUsersMap = new Map<string, User>();
    for (const u of existingUsers) { if (u.peopleVineId) existingUsersMap.set(u.peopleVineId, u); }

    log('info', 'Syncing users');
    await Promise.all(Array.from(allCustomersMap.values()).map(async (customer) => {
      const pvId = customer.id.toString();
      const existingUser = existingUsersMap.get(pvId);
      const company = companiesByNameMap.get(customer.company_name);
      if (!company) return;

      if (existingUser && company.id !== existingUser.companyId) {
        return updateUser(c, { id: existingUser.id, name: customer.full_name, email: customer.email, companyId: company.id });
      }
      if (existingUser && company.id === existingUser.companyId) {
        if (existingUser.name !== customer.full_name || existingUser.email !== customer.email.toLowerCase()) {
          log('info', `Updating user ${customer.full_name} (${customer.email}) details.`);
          return updateUser(c, { id: existingUser.id, name: customer.full_name, email: customer.email });
        }
        return;
      }
      return createUser(c, { name: customer.full_name, email: customer.email, peopleVineId: pvId, role: Role.USER, companyId: company.id });
    }));

    if (customerHadErrors) {
      log('warn', '[sync] Skipping user deactivation — customer fetch had errors.');
      log('info', 'Continue sync complete (deactivation skipped).');
      await flush(100, 'Complete', 'completed');
      if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
      return;
    }

    await flush(90, 'Deactivating removed users');
    log('info', 'Deactivating removed users');
    existingUsers = await prisma.user.findMany();
    const activePVUserIds = new Set<string>(allCustomersMap.keys());
    await Promise.all(existingUsers.map(async (u) => {
      if (u.peopleVineId && !activePVUserIds.has(u.peopleVineId)) return deactivateUser(c, u.id);
    }));

    log('info', 'PeopleVine continue sync complete.');
    await flush(100, 'Complete', 'completed');
    if (sessionId) await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-continue] Fatal error: ${msg}`);
    if (sessionId) {
      try {
        const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
        const existingLogs: LogEntry[] = session ? JSON.parse(session.logs) : [];
        existingLogs.push({ time: new Date().toISOString(), level: 'error', message: `Sync failed: ${msg}` });
        await prisma.syncSession.update({ where: { id: sessionId }, data: { status: 'failed', step: 'Failed', logs: JSON.stringify(existingLogs), completedAt: new Date() } });
      } catch {}
    }
    throw err;
  }
}

export const syncOne = async (c: Context, peopleVineId: number): Promise<void> => {
  const prisma: PrismaClient = c.get('db');

  // Fetch the specific customer from PeopleVine
  console.log(`Syncing customer with PeopleVine ID ${peopleVineId}`);
  const customer = await getCustomer(c, peopleVineId.toString());

  if (!customer) {
    console.log(`Customer with PeopleVine ID ${peopleVineId} not found.`);
    return;
  }

  console.log('Retrieved customer:', customer);

  // Fetch customers from PeopleVine which have active subscriptions
  const { customers: peopleVineCustomersFromSubscriptions } = await getCustomersFromSubscriptions(c);

  // Create a map of PeopleVine companies by their PeopleVine ID for easy lookup
  let companyProfilesMap: Map<string, PeopleVineCustomer> = new Map();
  for (const company of peopleVineCustomersFromSubscriptions) {
    companyProfilesMap.set(company.id.toString(), company);
  }

  const isCompanyProfile = companyProfilesMap.has(customer.id.toString());
  const existingCompanyByPvId = await prisma.company.findFirst({ where: { peopleVineId: customer.id.toString() } });
  const existingCompanyByEmail = await prisma.company.findFirst({ where: { email: customer.email.toLowerCase() } });
  const existingCompany = existingCompanyByPvId ?? existingCompanyByEmail;

  if (isCompanyProfile) {
    console.log(`Syncing ${existingCompany ? "existing" : "new"} company for ${customer.company_name}.`);
    if (existingCompany) {
      await prisma.company.update({
        where: { id: existingCompany.id },
        data: {
          name: customer.company_name,
          active: true,
          ...(!existingCompany.peopleVineId ? { peopleVineId: customer.id.toString() } : {}),
        },
      });
    } else {
      await createCompany(c, {
        name: customer.company_name,
        peopleVineId: customer.id.toString(),
        email: customer.email.toLowerCase(),
        active: true,
      });
    }
  }

  const associatedCompany = await prisma.company.findFirst({
    where: { name: customer.company_name },
  });
  if (!associatedCompany) {
    console.log(`No associated company found for user ${customer.full_name} (${customer.email}), skipping user creation.`);
    return;
  }

  const userByPvId = await prisma.user.findFirst({ where: { peopleVineId: customer.id.toString() } });
  const userByEmail = await prisma.user.findFirst({ where: { email: customer.email.toLowerCase() } });
  const associatedUser = userByPvId ?? userByEmail;

  if (associatedUser) {
    const needsUpdate =
      associatedUser.name !== customer.full_name ||
      associatedUser.email !== customer.email.toLowerCase() ||
      associatedUser.companyId !== associatedCompany.id ||
      (userByEmail && !userByEmail.peopleVineId);
    if (needsUpdate) {
      console.log(`Updating user ${customer.full_name} (${customer.email}) details.`);
      await updateUser(c, {
        id: associatedUser.id,
        name: customer.full_name,
        email: customer.email,
        companyId: associatedCompany.id,
        peopleVineId: customer.id.toString(),
      });
    }
  } else {
    console.log(`Creating user for ${customer.full_name} (${customer.email}).`);
    await createUser(c, {
      name: customer.full_name,
      email: customer.email,
      peopleVineId: customer.id.toString(),
      role: Role.USER,
      companyId: associatedCompany.id,
    });
  }
  console.log(`Sync for customer with PeopleVine ID ${peopleVineId} complete.`);
}