import { Context } from 'hono';
import { Company, PeopleVineToken, PeopleVineTokenType, PrismaClient, Role, User } from '@prisma/client';
import { createCompany, deactivateCompany, updateCompany } from './companyService';
import { createUser, deactivateUser, updateUser } from './userService';
export const runConcurrent = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>, afterBatch?: () => Promise<void>): Promise<void> => {
    for (let i = 0; i < items.length; i += limit) {
        await Promise.all(items.slice(i, i + limit).map(fn));
        if (afterBatch)
            await afterBatch();
    }
};
// PV returns company names with inconsistent casing across different endpoints/pages, and
// company-name lookups need to agree on one normalized form everywhere or the same real company
// ends up getting matched inconsistently (or re-created as a duplicate). Always key/look up
// company-name maps through this.
export const normCompanyKey = (name: string): string => name.trim().toLowerCase();
// syncOne looks companies up one at a time via direct DB queries (no in-memory map like the bulk
// sync phases), so it needs its own case-insensitive lookup. Non-personal companies are preferred
// when a name collides with both a personal and a non-personal row.
const findCompanyByNameCI = async (prisma: PrismaClient, name: string): Promise<Company | null> => {
    const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "Company" WHERE LOWER(TRIM(name)) = LOWER(TRIM(${name})) ORDER BY isPersonal ASC LIMIT 1`;
    if (rows.length === 0) return null;
    const row = rows[0];
    return { ...row, active: Boolean(row.active), isPersonal: Boolean(row.isPersonal) } as Company;
};
export const PEOPLEVINE_API_BASE_URL = 'https://api.peoplevine.dev/api';
export const hasPortalAccess = async (c: Context, primaryMembership: string | null | undefined, addOnsJson?: string | null): Promise<boolean> => {
    const prisma: PrismaClient = c.get('db');
    const candidates: string[] = [];
    if (primaryMembership)
        candidates.push(primaryMembership.trim());
    if (addOnsJson) {
        try {
            candidates.push(...(JSON.parse(addOnsJson) as string[]).map(a => a.trim()));
        }
        catch { }
    }
    if (candidates.length === 0)
        return false;
    const count = await prisma.portalAccessType.count({ where: { name: { in: candidates } } });
    return count > 0;
};
export interface RequestOptions {
    tokenType: PeopleVineTokenType;
    endpoint: string;
    method: 'GET';
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
}
export interface PeopleVineCustomer {
    id: number;
    company_name: string;
    rawCompanyName?: string;
    full_name: string;
    email: string;
    username?: string | null;
    isPersonal?: boolean;
    pvActive?: boolean;
    isMember?: boolean;
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
        if (level === 'error')
            console.error(message);
        else if (level === 'warn')
            console.warn(message);
        else
            console.log(message);
        logs.push({ time: new Date().toISOString(), level, message });
    };
    const flush = async (progress: number, step: string, status = 'running') => {
        if (!sessionId)
            return;
        try {
            const current = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { logs: true, status: true } }).catch(() => null);
            const existing: LogEntry[] = current?.logs ? JSON.parse(current.logs) : [];
            const merged = [...existing, ...logs];
            logs.length = 0;
            const nextStatus = current?.status === 'cancelled' ? 'cancelled' : status;
            await prisma.syncSession.update({
                where: { id: sessionId },
                data: { progress, step, status: nextStatus, logs: JSON.stringify(merged) },
            });
        }
        catch (e) {
            console.error('Failed to update sync session:', e);
        }
    };
    const saveMeta = async (patch: Record<string, unknown>) => {
        if (!sessionId)
            return;
        try {
            const current = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { metadata: true } }).catch(() => null);
            const existing: Record<string, unknown> = current?.metadata ? JSON.parse(current.metadata) : {};
            meta = { ...existing, ...meta, ...patch };
            await prisma.syncSession.update({ where: { id: sessionId }, data: { metadata: JSON.stringify(meta) } });
        }
        catch (e) {
            console.error('Failed to save sync metadata:', e);
        }
    };
    return { log, flush, saveMeta };
};
const writeDataBlob = async (prisma: PrismaClient, sessionId: string | undefined, key: string, data: unknown): Promise<void> => {
    if (!sessionId)
        return;
    const serialized = JSON.stringify(data);
    await prisma.syncExportBlob.upsert({
        where: { sessionId_key: { sessionId, key } },
        create: { sessionId, key, data: serialized },
        update: { data: serialized },
    });
};
const readDataBlob = async <T>(prisma: PrismaClient, sessionId: string | undefined, key: string, fallback: T): Promise<T> => {
    if (!sessionId)
        return fallback;
    const blob = await prisma.syncExportBlob.findUnique({ where: { sessionId_key: { sessionId, key } } });
    return blob ? (JSON.parse(blob.data) as T) : fallback;
};
const BLOB_CHUNK_MAX_BYTES = 500_000;
export const writeChunkedBlob = async (prisma: PrismaClient, sessionId: string | undefined, prefix: string, items: any[]): Promise<string[]> => {
    if (!sessionId)
        return [];
    const keys: string[] = [];
    const flushChunk = async (chunk: any[]) => {
        const key = `${prefix}-${String(keys.length).padStart(6, '0')}.json`;
        const data = JSON.stringify({ items: chunk });
        await prisma.syncExportBlob.upsert({
            where: { sessionId_key: { sessionId, key } },
            create: { sessionId, key, data },
            update: { data },
        });
        keys.push(key);
    };
    let chunk: any[] = [];
    let chunkBytes = 2;
    for (const item of items) {
        const itemBytes = JSON.stringify(item).length + 1;
        if (chunk.length > 0 && chunkBytes + itemBytes > BLOB_CHUNK_MAX_BYTES) {
            await flushChunk(chunk);
            chunk = [];
            chunkBytes = 2;
        }
        chunk.push(item);
        chunkBytes += itemBytes;
    }
    if (chunk.length > 0 || keys.length === 0)
        await flushChunk(chunk);
    return keys;
};
export const readChunkedBlob = async (prisma: PrismaClient, sessionId: string | undefined, keys: string[]): Promise<any[]> => {
    if (!sessionId)
        return [];
    const items: any[] = [];
    for (const key of keys) {
        const blob = await prisma.syncExportBlob.findUnique({ where: { sessionId_key: { sessionId, key } } });
        if (blob)
            items.push(...(JSON.parse(blob.data) as { items: any[] }).items);
    }
    return items;
};
const appendAuditChunk = async (prisma: PrismaClient, sessionId: string | undefined, category: string, items: unknown[]): Promise<void> => {
    if (!sessionId || items.length === 0)
        return;
    const key = `audit-${category}-${crypto.randomUUID()}.json`;
    await prisma.syncExportBlob.create({ data: { sessionId, key, data: JSON.stringify(items) } });
};
export const readAuditChunks = async (prisma: PrismaClient, sessionId: string, category: string): Promise<any[]> => {
    const blobs = await prisma.syncExportBlob.findMany({
        where: { sessionId, key: { startsWith: `audit-${category}-` } },
        select: { data: true },
    });
    const items: any[] = [];
    for (const b of blobs)
        items.push(...JSON.parse(b.data));
    return items;
};
const setToken = async (c: Context, tokenType: PeopleVineTokenType, accessToken: string, refreshToken: string, expiresAt: Date): Promise<PeopleVineToken> => {
    const prisma: PrismaClient = c.get('db');
    const existingToken = await prisma.peopleVineToken.findFirst({ where: { tokenType } });
    let returnToken: PeopleVineToken;
    if (existingToken) {
        returnToken = await prisma.peopleVineToken.update({
            where: { id: existingToken.id },
            data: { accessToken, refreshToken, expiresAt },
        });
    }
    else {
        returnToken = await prisma.peopleVineToken.create({
            data: { tokenType, accessToken, refreshToken, expiresAt },
        });
    }
    return returnToken;
};
const getStoredToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken | null> => {
    const prisma: PrismaClient = c.get('db');
    return prisma.peopleVineToken.findFirst({ where: { tokenType } });
};
const getUserToken = async (c: Context): Promise<PeopleVineToken> => {
    const storedToken = await getStoredToken(c, PeopleVineTokenType.USER);
    if (storedToken && storedToken.expiresAt > new Date(Date.now() + 60000)) {
        return storedToken;
    }
    const response = await fetch(`${PEOPLEVINE_API_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: c.env.PEOPLEVINE_ADMIN_USERNAME,
            password: c.env.PEOPLEVINE_ADMIN_PASSWORD,
            remember_me: true,
            grant_type: 'password',
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response (${response.status}): ${errorText}`);
        throw new Error('Failed to obtain user auth token');
    }
    const data: any = await response.json();
    return setToken(c, PeopleVineTokenType.USER, data.access_token, data.refresh_token, new Date(Date.now() + data.expires_in * 1000));
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
        console.error(`Error response (${response.status}): ${errorText}`);
        const err = new Error('Failed to obtain user company auth token') as Error & {
            status: number;
        };
        err.status = response.status;
        throw err;
    }
    const data: any = await response.json();
    return setToken(c, PeopleVineTokenType.USER_COMPANY, data.access_token, data.refresh_token, new Date(Date.now() + data.expires_in * 1000));
};
export const getUserCompanyToken = async (c: Context): Promise<PeopleVineToken> => {
    const storedToken = await getStoredToken(c, PeopleVineTokenType.USER_COMPANY);
    const expiresAtMs = storedToken ? new Date(storedToken.expiresAt).getTime() : 0;
    if (storedToken && expiresAtMs > Date.now() + 60000) {
        return storedToken;
    }
    const companyId = parseInt(c.env.PEOPLEVINE_COMPANY_ID as string);
    const userTokenRecord = await getUserToken(c);
    try {
        return await exchangeUserToCompanyToken(c, userTokenRecord, companyId);
    }
    catch (e: any) {
        if (e?.status === 400) {
            const prisma: PrismaClient = c.get('db');
            await prisma.peopleVineToken.deleteMany({
                where: { tokenType: { in: [PeopleVineTokenType.USER, PeopleVineTokenType.USER_COMPANY] } },
            }).catch(() => { });
            const freshUserToken = await getUserToken(c);
            return exchangeUserToCompanyToken(c, freshUserToken, companyId);
        }
        throw e;
    }
};
const getAuthToken = async (c: Context, tokenType: PeopleVineTokenType): Promise<PeopleVineToken> => {
    if (tokenType === PeopleVineTokenType.USER)
        return getUserToken(c);
    if (tokenType === PeopleVineTokenType.USER_COMPANY)
        return getUserCompanyToken(c);
    throw new Error('Invalid token type requested');
};
export const apiRequest = async (c: Context, options: RequestOptions): Promise<any> => {
    const { endpoint, method, headers, queryParams } = options;
    if ((method as string) !== 'GET') {
        const msg = `[PeopleVine] BLOCKED: ${method} ${endpoint} — PeopleVine is read-only. Write operations are not permitted.`;
        console.error(msg);
        throw new Error(msg);
    }
    const queryString = queryParams ? '?' + new URLSearchParams(queryParams).toString() : '';
    const executeRequest = async (): Promise<any> => {
        const authTokenRecord = await getAuthToken(c, options.tokenType);
        const fullUrl = `${PEOPLEVINE_API_BASE_URL}${endpoint}${queryString}`;
        console.log(`[PeopleVine] GET ${fullUrl}`);
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authTokenRecord.accessToken}`, ...(headers || {}) },
        });
        if (!response.ok) {
            const resText = await response.text();
            let errorDetails = resText;
            try {
                errorDetails = JSON.stringify(JSON.parse(resText), null, 2);
            }
            catch { }
            throw new Error(`API request failed with status ${response.status}\n${errorDetails}`);
        }
        return response.json();
    };
    try {
        return await executeRequest();
    }
    catch (e) {
        if (e instanceof Error && e.message.includes('status 400') && options.tokenType === PeopleVineTokenType.USER_COMPANY) {
            const prisma: PrismaClient = c.get('db');
            await prisma.peopleVineToken.deleteMany({
                where: { tokenType: { in: [PeopleVineTokenType.USER, PeopleVineTokenType.USER_COMPANY] } },
            }).catch(() => { });
        }
        throw e;
    }
};
const PV_MAX_RETRIES = 5;
interface PvPagination {
    page_number: number;
    page_size: number;
    total_pages: number;
    total_count: number;
    has_previous_page: boolean;
    has_next_page: boolean;
}
export const apiRequestWithPagination = async (c: Context, options: RequestOptions): Promise<{
    data: any[];
    pagination: PvPagination | null;
}> => {
    const { endpoint, method, headers, queryParams } = options;
    if ((method as string) !== 'GET') {
        const msg = `[PeopleVine] BLOCKED: ${method} ${endpoint} — PeopleVine is read-only.`;
        console.error(msg);
        throw new Error(msg);
    }
    const queryString = queryParams ? '?' + new URLSearchParams(queryParams).toString() : '';
    for (let attempt = 0; attempt < PV_MAX_RETRIES; attempt++) {
        const authTokenRecord = await getAuthToken(c, options.tokenType);
        const fullUrl = `${PEOPLEVINE_API_BASE_URL}${endpoint}${queryString}`;
        console.log(`[PeopleVine] GET ${fullUrl}`);
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authTokenRecord.accessToken}`, ...(headers || {}) },
        });
        if (!response.ok) {
            const resText = await response.text();
            let errorDetails = resText;
            try {
                errorDetails = JSON.stringify(JSON.parse(resText), null, 2);
            }
            catch { }
            console.error(`[apiRequestWithPagination] attempt ${attempt + 1} failed: status ${response.status}\n${errorDetails}`);
            if (response.status === 400 && options.tokenType === PeopleVineTokenType.USER_COMPANY) {
                const prisma: PrismaClient = c.get('db');
                await prisma.peopleVineToken.deleteMany({
                    where: { tokenType: { in: [PeopleVineTokenType.USER, PeopleVineTokenType.USER_COMPANY] } },
                }).catch(() => { });
            }
            if (attempt < PV_MAX_RETRIES - 1)
                await sleep(1000 * (attempt + 1));
            continue;
        }
        const data = await response.json();
        let pagination: PvPagination | null = null;
        const paginationHeader = response.headers.get('pagination');
        if (paginationHeader) {
            try {
                pagination = JSON.parse(paginationHeader);
            }
            catch { }
        }
        return { data: Array.isArray(data) ? data : [], pagination };
    }
    throw new Error(`[apiRequestWithPagination] ${endpoint} failed after ${PV_MAX_RETRIES} attempts`);
};
export const normalizeCustomers = (customers: any[]): PeopleVineCustomer[] => {
    return customers.map((customer) => {
        const pvActive = customer.status == null ? true : customer.status.toLowerCase() === 'active';
        const profilePhoto = (customer.profile_photo && customer.profile_photo.trim().length > 0)
            ? customer.profile_photo.trim()
            : null;
        const rawEmail = customer.email ? customer.email.toLowerCase().trim() : '';
        const username = (customer.username ?? '').trim() || null;
        const usernameAsEmail = username && username.includes('@') ? username.toLowerCase() : null;
        const email = rawEmail.length > 0 ? rawEmail : (usernameAsEmail ?? `${customer.id}@noemail.mhub`);
        const full_name = customer.full_name ? customer.full_name.trim() : '';
        let companyName = (customer.company_name ?? '').trim();
        const rawCompanyName = companyName;
        const isPersonal = companyName.length === 0 || companyName.toLowerCase() === full_name.toLowerCase();
        if (isPersonal) {
            companyName = full_name ? `${full_name}'s Company` : (username ? `${username}'s Company` : `PV #${customer.id}'s Company`);
        }
        const phone = customer.mobile?.number || customer.phone?.number || null;
        const address = customer.address?.address || null;
        const city = customer.address?.city || null;
        const state = customer.address?.state || null;
        const zipCode = customer.address?.zip_code || null;
        const cardStatus = customer.wallet?.status || null;
        return {
            ...customer,
            full_name,
            company_name: companyName,
            rawCompanyName,
            email,
            username,
            isPersonal,
            pvActive,
            isMember: customer.is_member === true,
            profilePhoto,
            phone,
            address,
            city,
            state,
            zipCode,
            cardStatus,
        };
    });
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const SUB_PAGE_SIZE = 100;
export const buildMembershipCardData = (cards: any[]): Record<string, {
    ownTypes: string[];
    primaryCardTitle: string | null;
    primaryCardSourceCompanyName: string | null;
    allCardTypes: string[];
    secondaryProviders: {
        title: string;
        providingCompanyName: string | null;
    }[];
}> => {
    const cardCompanyNameById = new Map<number, string | null>();
    for (const card of cards) {
        if (card.id != null)
            cardCompanyNameById.set(card.id, (card.customer_company_name ?? '').trim() || null);
    }
    const map: Record<string, {
        ownTypes: string[];
        primaryCardTitle: string | null;
        primaryCardSourceCompanyName: string | null;
        allCardTypes: string[];
        secondaryProviders: {
            title: string;
            providingCompanyName: string | null;
        }[];
    }> = {};
    for (const card of cards) {
        const customerId = card.customer_id?.toString();
        const title = (card.title ?? '').trim();
        if (!customerId || !title)
            continue;
        if (!map[customerId])
            map[customerId] = { ownTypes: [], primaryCardTitle: null, primaryCardSourceCompanyName: null, allCardTypes: [], secondaryProviders: [] };
        const entry = map[customerId];
        if (!entry.allCardTypes.includes(title))
            entry.allCardTypes.push(title);
        const parentCardId = card.parent_card_id ?? 0;
        if (parentCardId === 0) {
            if (!entry.ownTypes.includes(title))
                entry.ownTypes.push(title);
        }
        else {
            entry.secondaryProviders.push({ title, providingCompanyName: cardCompanyNameById.get(parentCardId) ?? null });
        }
        if (card.primary === true) {
            entry.primaryCardTitle = title;
            // Only a genuine sub-card (parent_card_id != 0) means someone else is actually
            // sponsoring this person. For their own root card, `customer_company_name` is just
            // that card's raw, unnormalized copy of their own name/company — surfacing it here
            // previously caused non-sponsored personal subscribers to get misattributed to an
            // unrelated company that happened to share their literal name (see: normCompanyKey).
            entry.primaryCardSourceCompanyName = parentCardId === 0
                ? null
                : (cardCompanyNameById.get(parentCardId) ?? null);
        }
    }
    return map;
};
const buildSubscriptionData = async (c: Context, subscriptions: any[], customerNo?: string): Promise<{
    customers: PeopleVineCustomer[];
    subscriptionInfoMap: Map<string, {
        membershipTypes: string[];
        isActive: boolean;
        attemptedTypes: string[];
        rawTitles: string[];
    }>;
    individualSubscriberIds: Set<string>;
    portalAccessTypes: Set<string>;
}> => {
    const prisma: PrismaClient = c.get('db');
    const [dbCompanyTypes, dbPortalTypes] = await Promise.all([
        prisma.companyMembershipType.findMany({ select: { name: true } }),
        prisma.companyMembershipType.findMany({ select: { name: true } }),
    ]);
    const companyMembershipTypes = new Set(dbCompanyTypes.map(t => t.name));
    const portalAccessTypes = new Set(dbPortalTypes.map(t => t.name));
    const subscriptionInfoMap = new Map<string, {
        membershipTypes: string[];
        isActive: boolean;
        attemptedTypes: string[];
        rawTitles: string[];
    }>();
    const individualSubscriberIds = new Set<string>();
    for (const sub of subscriptions) {
        const customer = sub?.customer;
        if (!customer?.id)
            continue;
        const pvId = customer.id.toString();
        const title = sub.title ? sub.title.trim() : null;
        const subIsActive = sub.status == null ? true : sub.status.toLowerCase() === 'active';
        if (!subscriptionInfoMap.has(pvId)) {
            subscriptionInfoMap.set(pvId, { membershipTypes: [], isActive: false, attemptedTypes: [], rawTitles: [] });
        }
        const entry = subscriptionInfoMap.get(pvId)!;
        if (title && subIsActive && !entry.rawTitles.includes(title)) {
            entry.rawTitles.push(title);
        }
        if (title && companyMembershipTypes.has(title)) {
            if (!entry.attemptedTypes.includes(title))
                entry.attemptedTypes.push(title);
            if (subIsActive) {
                entry.isActive = true;
                if (!entry.membershipTypes.includes(title)) {
                    entry.membershipTypes.push(title);
                }
                individualSubscriberIds.add(pvId);
            }
        }
    }
    const companySubscriptions = subscriptions.filter(sub => sub.title && companyMembershipTypes.has(sub.title.trim()));
    const dbPvIdSet = new Set<string>();
    if (!customerNo) {
        const dbCos = await prisma.company.findMany({ select: { peopleVineId: true } });
        for (const co of dbCos) {
            if (co.peopleVineId)
                dbPvIdSet.add(co.peopleVineId);
        }
    }
    const byCompanyName = new Map<string, Array<{
        customer: any;
        title: string;
    }>>();
    for (const sub of companySubscriptions) {
        const customer = sub?.customer;
        if (!customer)
            continue;
        const key = (customer.company_name ?? '').trim().toLowerCase();
        if (!byCompanyName.has(key))
            byCompanyName.set(key, []);
        byCompanyName.get(key)!.push({ customer, title: sub.title?.trim() ?? '' });
    }
    const companies: any[] = [];
    for (const subs of byCompanyName.values()) {
        const dbMatch = subs.find(s => dbPvIdSet.has(s.customer.id.toString()));
        companies.push((dbMatch ?? subs[0]).customer);
    }
    return { customers: normalizeCustomers(companies), subscriptionInfoMap, individualSubscriberIds, portalAccessTypes };
};
const getCustomersFromSubscriptions = async (c: Context, customerNo?: string, statusFilter: string | null = 'active'): Promise<{
    customers: PeopleVineCustomer[];
    hadErrors: boolean;
    skippedSubPages: number[];
    subscriptionInfoMap: Map<string, {
        membershipTypes: string[];
        isActive: boolean;
        attemptedTypes: string[];
        rawTitles: string[];
    }>;
    individualSubscriberIds: Set<string>;
    portalAccessTypes: Set<string>;
}> => {
    const subscriptions: any[] = [];
    const skippedSubPages: number[] = [];
    for (let pageNumber = 1; pageNumber <= 500; pageNumber++) {
        let result: {
            data: any[];
            pagination: PvPagination | null;
        } | undefined;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                result = await apiRequestWithPagination(c, {
                    tokenType: PeopleVineTokenType.USER_COMPANY,
                    endpoint: '/subscriptions',
                    method: 'GET',
                    queryParams: {
                        Page_Size: String(SUB_PAGE_SIZE),
                        Page_Number: String(pageNumber),
                        ...(customerNo ? { Customer_Id: customerNo } : {}),
                        ...(statusFilter ? { Status: statusFilter } : {}),
                    },
                });
                break;
            }
            catch (err) {
                lastErr = err;
                if (attempt < 2)
                    await sleep(1000 * (attempt + 1));
            }
        }
        if (!result) {
            console.warn(`[subscriptions] page ${pageNumber} failed after 3 attempts, skipping: ${lastErr}`);
            skippedSubPages.push(pageNumber);
            continue;
        }
        subscriptions.push(...result.data);
        if (!result.pagination?.has_next_page)
            break;
    }
    const data = await buildSubscriptionData(c, subscriptions, customerNo);
    return { ...data, hadErrors: skippedSubPages.length > 0, skippedSubPages };
};
export const getCustomers = async (c: Context, startPage = 1, maxPages?: number, onPageFetched?: (page: number) => Promise<void>): Promise<{
    customers: PeopleVineCustomer[];
    hadErrors: boolean;
    lastPage: number;
    hasMore: boolean;
}> => {
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
            }
            catch (err) {
                lastErr = err;
                attempt++;
                if (attempt < 3)
                    await sleep(1000 * attempt);
            }
        }
        if (!success) {
            console.warn(`[customers] page ${pageNumber} failed after 3 attempts: ${lastErr}`);
            hadErrors = true;
            pageNumber++;
            consecutiveErrors++;
            if (consecutiveErrors >= 3)
                break;
            continue;
        }
        consecutiveErrors = 0;
        customers = customers.concat(retrievedCustomers!);
        lastPage = pageNumber;
        pagesProcessed++;
        console.log(`Fetched ${retrievedCustomers!.length} customers from page ${pageNumber}`);
        if (onPageFetched)
            await onPageFetched(pageNumber);
        pageNumber++;
        if (retrievedCustomers!.length === 0 || retrievedCustomers!.length < pageSize)
            break;
    } while (true);
    return { customers: normalizeCustomers(customers), hadErrors, lastPage, hasMore };
};
export const getCustomer = async (c: Context, peopleVineId: string): Promise<PeopleVineCustomer | null> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const customer = await apiRequest(c, {
                tokenType: PeopleVineTokenType.USER_COMPANY,
                endpoint: `/customers/${peopleVineId}`,
                method: 'GET',
            });
            if (!customer || typeof customer !== 'object')
                return null;
            return normalizeCustomers([customer])[0] ?? null;
        }
        catch (err) {
            lastErr = err;
            if (attempt < 2)
                await sleep(1000 * (attempt + 1));
        }
    }
    throw lastErr;
};
export const resolvePlaceholderEmails = async (c: Context, customers: PeopleVineCustomer[]): Promise<PeopleVineCustomer[]> => {
    const resolved = [...customers];
    const placeholderIndices = resolved
        .map((cu, i) => (cu.email.endsWith('@noemail.mhub') ? i : -1))
        .filter(i => i >= 0);
    if (placeholderIndices.length > 0) {
        await runConcurrent(placeholderIndices, 5, async (idx) => {
            const individual = await getCustomer(c, resolved[idx].id.toString()).catch(() => null);
            if (individual) {
                resolved[idx] = individual;
            }
        });
    }
    return resolved;
};
export const getSubscriptionSample = async (c: Context): Promise<{
    subKeys: string[];
    sub: any;
    customerKeys: string[];
    customer: any;
}> => {
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
export const isUniqueConstraintError = (e: unknown): boolean => {
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    return msg.includes('already exists') || msg.includes('unique constraint') || (e as any)?.code === 'P2002';
};
// D1's raw error names the offending column, e.g. "UNIQUE constraint failed: User.username" —
// use that to know exactly which field to drop and retry, instead of assuming it's always email.
export const getUniqueConstraintField = (e: unknown): string | null => {
    const msg = e instanceof Error ? e.message : '';
    const match = msg.match(/UNIQUE constraint failed:\s*\w+\.(\w+)/i);
    if (match)
        return match[1];
    const meta = (e as any)?.meta?.target;
    if (Array.isArray(meta) && meta.length > 0)
        return String(meta[0]);
    if (typeof meta === 'string')
        return meta;
    return null;
};
// Looks up who currently holds the conflicting email/username so sync logs name both sides of
// the collision instead of just "unknown field" — makes these conflicts actually actionable.
export const describeUniqueConflict = async (
    prisma: PrismaClient,
    field: string | null,
    candidate: { email?: string | null; username?: string | null }
): Promise<string> => {
    if (field !== 'email' && field !== 'username')
        return `field "${field ?? 'unknown'}"`;
    const value = field === 'email' ? candidate.email?.toLowerCase() : candidate.username?.trim().toLowerCase();
    if (!value)
        return `field "${field}"`;
    const holder = await prisma.user.findFirst({
        where: field === 'email' ? { email: value } : { username: value },
        select: { id: true, name: true, peopleVineId: true },
    });
    return holder
        ? `${field}="${value}" (already held by ${holder.name}, PV#${holder.peopleVineId ?? 'n/a'}, id=${holder.id})`
        : `${field}="${value}" (no current holder found)`;
};
export const parsePvDate = (value: string | null | undefined): Date | null => {
    if (!value || value.startsWith('1900-01-01'))
        return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};
export class SyncCancelledError extends Error {
    constructor() { super('SYNC_CANCELLED'); this.name = 'SyncCancelledError'; }
}
export const checkCancelled = async (prisma: PrismaClient, sessionId: string | undefined): Promise<void> => {
    if (!sessionId)
        return;
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { status: true } }).catch(() => null);
    if (session?.status === 'cancelled')
        throw new SyncCancelledError();
};
export const syncPhaseCompanies = async (c: Context, sessionId?: string): Promise<{
    hadErrors: boolean;
}> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    await flush(5, 'Fetching subscriptions');
    log('info', 'Retrieving PeopleVine subscription data');
    const { customers: subCustomers, hadErrors, skippedSubPages, subscriptionInfoMap, individualSubscriberIds, portalAccessTypes } = await getCustomersFromSubscriptions(c);
    const companyProfilesMap = new Map<string, PeopleVineCustomer>();
    for (const cu of subCustomers)
        companyProfilesMap.set(cu.id.toString(), cu);
    const { subscriptionInfoMap: anyStatusSubscriptionInfoMap } = await getCustomersFromSubscriptions(c, undefined, null);
    const attemptedPVSubscriberIds = new Set<string>();
    for (const [pvId, info] of anyStatusSubscriptionInfoMap.entries()) {
        if (info.attemptedTypes.length > 0)
            attemptedPVSubscriberIds.add(pvId);
    }
    const dbCompanies = await prisma.company.findMany();
    const dbCompaniesMap = new Map<string, Company>();
    const dbCompaniesByName = new Map<string, Company>();
    for (const co of dbCompanies) {
        if (co.peopleVineId)
            dbCompaniesMap.set(co.peopleVineId, co);
        dbCompaniesByName.set(co.name.trim().toLowerCase(), co);
    }
    await flush(20, 'Syncing companies');
    log('info', 'Syncing companies');
    const activatedCompanyIds = new Set<string>();
    const auditCompaniesCreated: {
        id: string;
        name: string;
        pvId: string;
    }[] = [];
    const auditCompaniesUpdated: {
        id: string;
        name: string;
        pvId: string;
        changes: {
            field: string;
            before: string;
            after: string;
        }[];
    }[] = [];
    await runConcurrent(Array.from(companyProfilesMap.values()), 20, async (customer) => {
        const pvId = customer.id.toString();
        const subInfo = subscriptionInfoMap.get(pvId);
        const membershipTypes = subInfo?.membershipTypes ?? [];
        const isPersonal = customer.isPersonal ?? false;
        const isActive = subInfo?.isActive ?? false;
        const existingById = dbCompaniesMap.get(pvId);
        const existingByName = dbCompaniesByName.get(customer.company_name.trim().toLowerCase());
        const existing = existingById ?? existingByName;
        if (existing) {
            if (!existing.peopleVineId || existing.peopleVineId !== pvId) {
                log('info', `Merging duplicate company "${customer.company_name}" — assigning real PV ID.`);
            }
            const isPlaceholderEmail = existing.email.endsWith('@placeholder.invalid') || existing.email.endsWith('@noemail.mhub');
            const newEmail = isPlaceholderEmail && customer.email ? customer.email.toLowerCase() : undefined;
            try {
                await updateCompany(c, { id: existing.id, name: customer.company_name, active: isActive, membershipTypes, isPersonal, peopleVineId: pvId, email: newEmail });
            }
            catch (e) {
                if (isUniqueConstraintError(e)) {
                    log('warn', `[sync] Could not update email for company "${customer.company_name}" — email already in use.`);
                    await updateCompany(c, { id: existing.id, name: customer.company_name, active: isActive, membershipTypes, isPersonal, peopleVineId: pvId });
                }
                else {
                    throw e;
                }
            }
            if (isActive)
                activatedCompanyIds.add(existing.id);
            const coChanges: {
                field: string;
                before: string;
                after: string;
            }[] = [];
            const existingMTypes = JSON.parse(existing.membershipTypes || '[]') as string[];
            if (existing.name !== customer.company_name)
                coChanges.push({ field: 'name', before: existing.name, after: customer.company_name });
            if (existing.active !== isActive)
                coChanges.push({ field: 'active', before: String(existing.active), after: String(isActive) });
            if (JSON.stringify([...existingMTypes].sort()) !== JSON.stringify([...membershipTypes].sort()))
                coChanges.push({ field: 'membershipTypes', before: existingMTypes.join('; '), after: membershipTypes.join('; ') });
            if ((existing.isPersonal ?? false) !== isPersonal)
                coChanges.push({ field: 'isPersonal', before: String(existing.isPersonal), after: String(isPersonal) });
            auditCompaniesUpdated.push({ id: existing.id, name: customer.company_name, pvId, changes: coChanges });
        }
        else {
            const created = await createCompany(c, { name: customer.company_name, peopleVineId: pvId, active: isActive, email: customer.email.toLowerCase(), membershipTypes, isPersonal });
            if (isActive && created)
                activatedCompanyIds.add(created.id);
            if (created)
                auditCompaniesCreated.push({ id: created.id, name: created.name, pvId });
        }
    }, () => checkCancelled(prisma, sessionId));
    const subscriberMemberships: Record<string, string | null> = {};
    const individualMembershipTypes: Record<string, string[]> = {};
    for (const [pvId, info] of subscriptionInfoMap.entries()) {
        const portalType = info.membershipTypes.find(t => portalAccessTypes.has(t));
        subscriberMemberships[pvId] = portalType ?? info.membershipTypes[0] ?? info.rawTitles[0] ?? null;
        individualMembershipTypes[pvId] = info.membershipTypes.length > 0 ? info.membershipTypes : info.rawTitles;
    }
    await writeDataBlob(prisma, sessionId, 'phase1-data.json', {
        activePVCompanyIds: Array.from(companyProfilesMap.keys()),
        activePVSubscriberIds: Array.from(individualSubscriberIds),
        attemptedPVSubscriberIds: Array.from(attemptedPVSubscriberIds),
        activatedCompanyIds: Array.from(activatedCompanyIds),
        subscriberMemberships,
        individualMembershipTypes,
    });
    await appendAuditChunk(prisma, sessionId, 'companiesCreated', auditCompaniesCreated);
    await appendAuditChunk(prisma, sessionId, 'companiesUpdated', auditCompaniesUpdated);
    const sessionForCounts = sessionId ? await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { metadata: true } }) : null;
    const metaForCounts: Record<string, any> = sessionForCounts ? JSON.parse(sessionForCounts.metadata ?? '{}') : {};
    const auditCounts: Record<string, number> = { ...(metaForCounts.auditCounts ?? {}) };
    auditCounts.companiesCreated = (auditCounts.companiesCreated ?? 0) + auditCompaniesCreated.length;
    auditCounts.companiesUpdated = (auditCounts.companiesUpdated ?? 0) + auditCompaniesUpdated.length;
    await saveMeta({
        companiesDone: true,
        lastCustomerPage: 0,
        skippedSubPages,
        auditCounts,
    });
    await flush(30, 'Companies synced — queuing user sync');
    log('info', 'Companies sync complete. User sync queued.');
    return { hadErrors };
};
const BATCH_PAGES = 10;
export const syncPhaseUsers = async (c: Context, sessionId?: string, startPage = 1): Promise<{
    hadErrors: boolean;
    hasMore: boolean;
    lastPage: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    await flush(35, `Fetching customers (page ${startPage}+)`);
    log('info', 'Loading companies from database');
    const dbCompanies = await prisma.company.findMany();
    const companiesByNameMap = new Map<string, Company>();
    for (const co of dbCompanies) {
        const key = normCompanyKey(co.name);
        const existing = companiesByNameMap.get(key);
        if (existing) {
            log('warn', `[sync] Duplicate company name: "${co.name}" — IDs ${existing.id} and ${co.id}.`);
            if (!existing.peopleVineId && co.peopleVineId) {
                companiesByNameMap.set(key, co);
            }
        }
        else {
            companiesByNameMap.set(key, co);
        }
    }
    const pendingCompanyCreations = new Map<string, Promise<Company | undefined>>();
    log('info', `Retrieving customers from PeopleVine (pages ${startPage}–${startPage + BATCH_PAGES - 1})`);
    const { customers: rawBatchCustomers, hadErrors, lastPage, hasMore } = await getCustomers(c, startPage, BATCH_PAGES, (page) => saveMeta({ lastCustomerPage: page }));
    const batchCustomers = await resolvePlaceholderEmails(c, rawBatchCustomers);
    const batchCustomersMap = new Map<string, PeopleVineCustomer>();
    for (const cu of batchCustomers)
        batchCustomersMap.set(cu.id.toString(), cu);
    const existingUsers = await prisma.user.findMany();
    const byPvId = new Map<string, User>();
    const byEmail = new Map<string, User>();
    for (const u of existingUsers) {
        if (u.peopleVineId)
            byPvId.set(u.peopleVineId, u);
        byEmail.set(u.email, u);
    }
    const sessionForMeta = sessionId ? await prisma.syncSession.findUnique({ where: { id: sessionId } }) : null;
    const sessionMeta: Record<string, any> = sessionForMeta ? JSON.parse(sessionForMeta.metadata ?? '{}') : {};
    const phase1Data = await readDataBlob(prisma, sessionId, 'phase1-data.json', {
        activePVSubscriberIds: [] as string[],
        attemptedPVSubscriberIds: [] as string[],
        subscriberMemberships: {} as Record<string, string | null>,
        individualMembershipTypes: {} as Record<string, string[]>,
    });
    const activePVSubscriberIds = new Set<string>(phase1Data.activePVSubscriberIds);
    const attemptedPVSubscriberIds = new Set<string>(phase1Data.attemptedPVSubscriberIds ?? []);
    const subscriberMemberships: Record<string, string | null> = phase1Data.subscriberMemberships;
    const individualMembershipTypes: Record<string, string[]> = phase1Data.individualMembershipTypes;
    const includeFreeMembers: boolean = sessionMeta.includeFreeMembers !== false;
    const activePVUserIds = await readDataBlob(prisma, sessionId, 'phase2-activePVUserIds.json', [] as string[]);
    const dbPortalTypes = await prisma.companyMembershipType.findMany({ select: { name: true } });
    const portalTypeSet = new Set(dbPortalTypes.map(t => t.name));
    const dbPrimaryTypes = await prisma.primarySubscriptionType.findMany({ select: { name: true } });
    const primaryTypeSet = new Set(dbPrimaryTypes.map(t => t.name));
    const dbAddonTypes = await prisma.addonSubscriptionType.findMany({ select: { name: true } });
    const addonTypeSet = new Set(dbAddonTypes.map(t => t.name));
    const dbFreeMemberExclusions = await prisma.freeMemberExclusionType.findMany({ select: { name: true } });
    const freeMemberExclusionSet = new Set(dbFreeMemberExclusions.map(t => t.name));
    const getPrimaryType = (co: {
        membershipTypes: string;
    }): string | null => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        const nonAddon = types.filter(t => !addonTypeSet.has(t));
        return types.find(t => primaryTypeSet.has(t)) ?? nonAddon.find(t => portalTypeSet.has(t)) ?? nonAddon[0] ?? null;
    };
    const getAddonTypes = (co: {
        membershipTypes: string;
    }): string[] => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        return types.filter(t => addonTypeSet.has(t));
    };
    const companyQualifiesForFreeMember = (co: {
        membershipTypes: string;
    }): boolean => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        return types.some(t => (portalTypeSet.has(t) || primaryTypeSet.has(t)) && !freeMemberExclusionSet.has(t));
    };
    await flush(70, 'Syncing users');
    log('info', 'Syncing users');
    const auditUsersCreated: {
        id: string;
        name: string;
        email: string;
        companyId: string;
    }[] = [];
    const auditUsersUpdated: {
        id: string;
        name: string;
        email: string;
        companyId: string;
        changes: {
            field: string;
            before: string;
            after: string;
        }[];
    }[] = [];
    const processCustomer = async (customer: PeopleVineCustomer) => {
        const pvId = customer.id.toString();
        const isSubscriber = activePVSubscriberIds.has(pvId);
        const isMember = customer.isMember ?? false;
        const existingByPvId = byPvId.get(pvId);
        const existingByEmail = byEmail.get(customer.email.toLowerCase());
        const existingUser = existingByPvId ?? (existingByEmail && !existingByEmail.peopleVineId ? existingByEmail : undefined);
        if (existingUser && existingUser.role === 'ADMIN')
            return;
        let company = companiesByNameMap.get(normCompanyKey(customer.company_name));
        const hadExistingCompany = !!company;
        if (company && !company.active && isSubscriber) {
            company = undefined;
        }
        if (!company) {
            if (!existingUser && !isSubscriber && (!isMember || !includeFreeMembers))
                return;
            const companyName = customer.company_name || `${customer.full_name}'s Company`;
            const companyKey = normCompanyKey(companyName);
            company = await prisma.company.findFirst({ where: { name: companyName } }) ?? undefined;
            if (!company) {
                if (pendingCompanyCreations.has(companyKey)) {
                    company = await pendingCompanyCreations.get(companyKey);
                }
                else {
                    const creation = (async (): Promise<Company | undefined> => {
                        const membershipType = subscriberMemberships[pvId] ?? null;
                        try {
                            return await createCompany(c, {
                                name: companyName,
                                peopleVineId: pvId,
                                active: true,
                                email: customer.email.toLowerCase(),
                                membershipTypes: membershipType ? [membershipType] : [],
                                isPersonal: !customer.company_name,
                            });
                        }
                        catch {
                            return await prisma.company.findFirst({ where: { OR: [{ peopleVineId: pvId }, { name: companyName }] } }) ?? undefined;
                        }
                    })();
                    pendingCompanyCreations.set(companyKey, creation);
                    company = await creation;
                }
                if (!company)
                    return;
                companiesByNameMap.set(companyKey, company);
            }
        }
        const pvUserActive = (customer.pvActive ?? true) && (isMember
            ? companyQualifiesForFreeMember(company)
            : isSubscriber);
        const memberSource = (isSubscriber || attemptedPVSubscriberIds.has(pvId)) ? 'subscription' : 'membership';
        const ownMembershipTypesJson = JSON.stringify(individualMembershipTypes[pvId] ?? []);
        const newPrimary = getPrimaryType({ membershipTypes: ownMembershipTypesJson });
        const newAddOns = getAddonTypes({ membershipTypes: ownMembershipTypesJson });
        if (existingUser) {
            const needsUpdate = existingUser.name !== customer.full_name ||
                existingUser.email !== customer.email.toLowerCase() ||
                existingUser.companyId !== company.id ||
                existingUser.primaryMembership !== newPrimary ||
                existingUser.addOns !== JSON.stringify(newAddOns) ||
                existingUser.active !== pvUserActive ||
                existingUser.profilePhoto !== (customer.profilePhoto ?? null) ||
                existingUser.username !== (customer.username ? customer.username.trim().toLowerCase() : null) ||
                (existingByEmail && !existingByEmail.peopleVineId) ||
                existingUser.phone !== (customer.phone ?? null) ||
                existingUser.address !== (customer.address ?? null) ||
                existingUser.city !== (customer.city ?? null) ||
                existingUser.state !== (customer.state ?? null) ||
                existingUser.zipCode !== (customer.zipCode ?? null) ||
                existingUser.cardStatus !== (customer.cardStatus ?? null) ||
                existingUser.memberSource !== memberSource;
            if (needsUpdate) {
                const uChanges: {
                    field: string;
                    before: string;
                    after: string;
                }[] = [];
                const newEmailLower = customer.email.toLowerCase();
                const newAddOnsJson = JSON.stringify(newAddOns);
                const newUsername = customer.username ? customer.username.trim().toLowerCase() : null;
                if (existingUser.name !== customer.full_name)
                    uChanges.push({ field: 'name', before: existingUser.name, after: customer.full_name });
                if (existingUser.email !== newEmailLower)
                    uChanges.push({ field: 'email', before: existingUser.email, after: newEmailLower });
                if (existingUser.active !== pvUserActive)
                    uChanges.push({ field: 'active', before: String(existingUser.active), after: String(pvUserActive) });
                if (existingUser.companyId !== company.id)
                    uChanges.push({ field: 'company', before: existingUser.companyId, after: company.id });
                if (existingUser.primaryMembership !== newPrimary)
                    uChanges.push({ field: 'primaryMembership', before: String(existingUser.primaryMembership), after: String(newPrimary) });
                if (existingUser.addOns !== newAddOnsJson)
                    uChanges.push({ field: 'addOns', before: existingUser.addOns || '[]', after: newAddOnsJson });
                if (existingUser.memberSource !== memberSource)
                    uChanges.push({ field: 'memberSource', before: String(existingUser.memberSource), after: memberSource });
                if (existingUser.username !== newUsername)
                    uChanges.push({ field: 'username', before: String(existingUser.username), after: String(newUsername) });
                if (existingUser.phone !== (customer.phone ?? null))
                    uChanges.push({ field: 'phone', before: String(existingUser.phone), after: String(customer.phone ?? null) });
                if (existingUser.address !== (customer.address ?? null))
                    uChanges.push({ field: 'address', before: String(existingUser.address), after: String(customer.address ?? null) });
                if (existingUser.city !== (customer.city ?? null))
                    uChanges.push({ field: 'city', before: String(existingUser.city), after: String(customer.city ?? null) });
                if (existingUser.state !== (customer.state ?? null))
                    uChanges.push({ field: 'state', before: String(existingUser.state), after: String(customer.state ?? null) });
                if (existingUser.zipCode !== (customer.zipCode ?? null))
                    uChanges.push({ field: 'zipCode', before: String(existingUser.zipCode), after: String(customer.zipCode ?? null) });
                if (existingUser.cardStatus !== (customer.cardStatus ?? null))
                    uChanges.push({ field: 'cardStatus', before: String(existingUser.cardStatus), after: String(customer.cardStatus ?? null) });
                log('info', `Updating user ${customer.full_name} (${customer.email}).`);
                const userUpdatePayload: Record<string, any> = {
                    id: existingUser.id,
                    name: customer.full_name,
                    email: customer.email,
                    username: customer.username ?? null,
                    companyId: company.id,
                    peopleVineId: pvId,
                    primaryMembership: newPrimary,
                    addOns: newAddOns,
                    profilePhoto: customer.profilePhoto,
                    active: pvUserActive,
                    phone: customer.phone ?? null,
                    address: customer.address ?? null,
                    city: customer.city ?? null,
                    state: customer.state ?? null,
                    zipCode: customer.zipCode ?? null,
                    cardStatus: customer.cardStatus ?? null,
                    memberSource,
                };
                try {
                    await updateUser(c, userUpdatePayload as any);
                    auditUsersUpdated.push({ id: existingUser.id, name: customer.full_name, email: newEmailLower, companyId: company.id, changes: uChanges });
                }
                catch (e) {
                    if (isUniqueConstraintError(e)) {
                        // See syncOne — a stale/duplicate value on any one unique field used to
                        // silently abort this whole user's update, blocking unrelated fixes.
                        const conflictingField = getUniqueConstraintField(e);
                        const conflictDetail = await describeUniqueConflict(prisma, conflictingField, userUpdatePayload);
                        log('warn', `[sync] Unique constraint conflict updating user ${customer.full_name} (PV#${pvId}) on ${conflictDetail}.`);
                        if (conflictingField && conflictingField in userUpdatePayload) {
                            const retryPayload = { ...userUpdatePayload };
                            delete retryPayload[conflictingField];
                            try {
                                await updateUser(c, retryPayload as any);
                                auditUsersUpdated.push({ id: existingUser.id, name: customer.full_name, email: newEmailLower, companyId: company.id, changes: uChanges });
                            }
                            catch (retryError) {
                                log('warn', `[sync] Retry without "${conflictingField}" still failed for ${customer.full_name}.`);
                                if (!isUniqueConstraintError(retryError))
                                    throw retryError;
                            }
                        }
                        return;
                    }
                    throw e;
                }
            }
            return;
        }
        const userCreatePayload = {
            name: customer.full_name,
            email: customer.email,
            username: customer.username ?? null,
            peopleVineId: pvId,
            role: Role.USER,
            companyId: company.id,
            primaryMembership: newPrimary,
            addOns: newAddOns,
            profilePhoto: customer.profilePhoto,
            active: pvUserActive,
            phone: customer.phone ?? null,
            address: customer.address ?? null,
            city: customer.city ?? null,
            state: customer.state ?? null,
            zipCode: customer.zipCode ?? null,
            cardStatus: customer.cardStatus ?? null,
            memberSource,
        };
        try {
            const createdUser = await createUser(c, userCreatePayload);
            auditUsersCreated.push({ id: createdUser.id, name: customer.full_name, email: customer.email.toLowerCase(), companyId: company.id });
        }
        catch (e) {
            if (isUniqueConstraintError(e)) {
                const conflictingField = getUniqueConstraintField(e);
                const conflictDetail = await describeUniqueConflict(prisma, conflictingField, userCreatePayload);
                log('warn', `[sync] Unique constraint conflict creating user ${customer.full_name} (PV#${pvId}) on ${conflictDetail}.`);
                // Only "username" is safe to drop and retry here — email/peopleVineId/role/companyId
                // are required to create a user at all, so a conflict on those means a genuine
                // duplicate that needs manual resolution, not a field we can just omit.
                if (conflictingField === 'username') {
                    try {
                        const createdUser = await createUser(c, { ...userCreatePayload, username: null });
                        auditUsersCreated.push({ id: createdUser.id, name: customer.full_name, email: customer.email.toLowerCase(), companyId: company.id });
                    }
                    catch (retryError) {
                        log('warn', `[sync] Retry without "username" still failed creating ${customer.full_name}.`);
                        if (!isUniqueConstraintError(retryError))
                            throw retryError;
                    }
                }
                return;
            }
            throw e;
        }
    };
    await runConcurrent(Array.from(batchCustomersMap.values()), 20, processCustomer, () => checkCancelled(prisma, sessionId));
    if (!hasMore && activePVSubscriberIds.size > 0) {
        const allSeenIds = new Set<string>([
            ...activePVUserIds,
            ...batchCustomersMap.keys(),
        ]);
        const missedIds = Array.from(activePVSubscriberIds).filter(id => !allSeenIds.has(id));
        if (missedIds.length > 0) {
            log('info', `Found ${missedIds.length} active subscribers not returned by /customers — fetching individually`);
            await flush(85, `Syncing ${missedIds.length} missed subscribers`);
            await runConcurrent(missedIds, 10, async (pvId) => {
                const customer = await getCustomer(c, pvId);
                if (!customer)
                    return;
                await processCustomer(customer);
            }, () => checkCancelled(prisma, sessionId));
        }
    }
    if (sessionId) {
        await writeDataBlob(prisma, sessionId, 'phase2-activePVUserIds.json', [...activePVUserIds, ...Array.from(batchCustomersMap.keys())]);
        await appendAuditChunk(prisma, sessionId, 'usersCreated', auditUsersCreated);
        await appendAuditChunk(prisma, sessionId, 'usersUpdated', auditUsersUpdated);
        const session = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { metadata: true } });
        const meta = session ? JSON.parse(session.metadata ?? '{}') : {};
        const auditCounts: Record<string, number> = { ...(meta.auditCounts ?? {}) };
        auditCounts.usersCreated = (auditCounts.usersCreated ?? 0) + auditUsersCreated.length;
        auditCounts.usersUpdated = (auditCounts.usersUpdated ?? 0) + auditUsersUpdated.length;
        await saveMeta({
            usersDone: !hasMore,
            userHadErrors: hadErrors || (meta.userHadErrors === true),
            auditCounts,
        });
    }
    await flush(hasMore ? 75 : 90, hasMore ? `Users batch done — fetching next pages` : 'Users synced', 'running');
    log('info', hasMore ? `Batch done (pages ${startPage}–${lastPage}). Queuing next batch from page ${lastPage + 1}.` : 'Users sync complete.');
    return { hadErrors, hasMore, lastPage };
};
export const syncPhaseDeactivate = async (c: Context, sessionId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    await flush(92, 'Deactivating removed records');
    const session = sessionId ? await prisma.syncSession.findUnique({ where: { id: sessionId } }) : null;
    const meta: Record<string, any> = session ? JSON.parse(session.metadata ?? '{}') : {};
    const auditCompaniesDeactivated: {
        id: string;
        name: string;
    }[] = [];
    const auditUsersDeactivated: {
        id: string;
        name: string;
        email: string;
    }[] = [];
    const phase1Data = await readDataBlob(prisma, sessionId, 'phase1-data.json', {
        activePVCompanyIds: [] as string[],
        activePVSubscriberIds: [] as string[],
        activatedCompanyIds: [] as string[],
    });
    const activePVCompanyIds: string[] = phase1Data.activePVCompanyIds;
    const activePVSubscriberIds = new Set<string>(phase1Data.activePVSubscriberIds);
    const activePVCompanySet = new Set(activePVCompanyIds);
    if (activePVCompanyIds.length > 0) {
        const orphanedUsers = await prisma.user.findMany({
            where: { role: 'USER', peopleVineId: null, memberSource: { not: 'membership' }, isSystemAccount: false },
            include: { company: { select: { peopleVineId: true } } },
        });
        log('info', `[deactivate] Found ${orphanedUsers.length} orphaned users with no PV ID.`);
        await runConcurrent(orphanedUsers, 20, async (u) => {
            const companyPvId = u.company?.peopleVineId;
            if (companyPvId && (activePVCompanySet.has(companyPvId) || activePVSubscriberIds.has(companyPvId)))
                return;
            log('info', `[deactivate] Deactivating orphaned user: ${u.email}`);
            auditUsersDeactivated.push({ id: u.id, name: u.name, email: u.email });
            await deactivateUser(c, u.id);
        }, () => checkCancelled(prisma, sessionId));
    }
    else {
        log('warn', `[deactivate] activePVCompanyIds is empty — skipping orphaned user deactivation.`);
    }
    const skippedSubPages: number[] = meta.skippedSubPages ?? (meta.companyHadErrors ? [2] : []);
    const hasRealSubErrors = skippedSubPages.some(p => p !== 2);
    if (hasRealSubErrors || meta.userHadErrors) {
        log('warn', '[sync] Skipping deactivation — previous phase had errors.');
        log('info', 'Deactivation skipped — continuing to verification phases.');
        await flush(93, 'Deactivation skipped — starting verification');
        return;
    }
    if (skippedSubPages.length > 0) {
        log('warn', `[sync] Subscription page(s) [${skippedSubPages.join(', ')}] failed but proceeding with deactivation.`);
    }
    const activePVUserIds = await readDataBlob(prisma, sessionId, 'phase2-activePVUserIds.json', [] as string[]);
    const activatedCompanyIds = new Set<string>(phase1Data.activatedCompanyIds);
    if (activePVCompanyIds.length === 0 && activePVUserIds.length === 0) {
        log('warn', '[sync] No active PV IDs in session metadata, skipping deactivation.');
        await flush(93, 'Deactivation skipped — starting verification');
        return;
    }
    log('info', 'Deactivating removed companies and users');
    if (activePVCompanyIds.length > 0) {
        const dbCompanies = await prisma.company.findMany();
        await runConcurrent(dbCompanies, 20, async (co) => {
            // System/internal tracking accounts are never expected to appear in PV's active
            // dataset, so they'd otherwise get deactivated by this pass on every single sync.
            if (co.isSystemAccount)
                return;
            if (activatedCompanyIds.has(co.id))
                return;
            if (!co.peopleVineId) {
                auditCompaniesDeactivated.push({ id: co.id, name: co.name });
                await deactivateCompany(c, co.id);
                return;
            }
            if (!activePVCompanySet.has(co.peopleVineId) && !activePVSubscriberIds.has(co.peopleVineId)) {
                auditCompaniesDeactivated.push({ id: co.id, name: co.name });
                await deactivateCompany(c, co.id);
            }
        }, () => checkCancelled(prisma, sessionId));
    }
    if (activePVUserIds.length > 0) {
        const activePVUserSet = new Set(activePVUserIds);
        const existingUsers = await prisma.user.findMany({
            where: { role: 'USER', peopleVineId: { not: null }, isSystemAccount: false },
            include: { company: { select: { active: true } } },
        });
        await runConcurrent(existingUsers, 20, async (u) => {
            if (activePVSubscriberIds.has(u.peopleVineId!))
                return;
            if (!activePVUserSet.has(u.peopleVineId!)) {
                auditUsersDeactivated.push({ id: u.id, name: u.name, email: u.email });
                await deactivateUser(c, u.id);
                return;
            }
            if (u.memberSource === 'membership')
                return;
            if (u.company && !u.company.active) {
                log('info', `[deactivate] Deactivating user of inactive company: ${u.email}`);
                auditUsersDeactivated.push({ id: u.id, name: u.name, email: u.email });
                await deactivateUser(c, u.id);
            }
        }, () => checkCancelled(prisma, sessionId));
    }
    log('info', 'Deactivation phase complete — continuing to verification phases.');
    await appendAuditChunk(prisma, sessionId, 'companiesDeactivated', auditCompaniesDeactivated);
    await appendAuditChunk(prisma, sessionId, 'usersDeactivated', auditUsersDeactivated);
    if (sessionId) {
        const auditCounts: Record<string, number> = { ...(meta.auditCounts ?? {}) };
        auditCounts.companiesDeactivated = (auditCounts.companiesDeactivated ?? 0) + auditCompaniesDeactivated.length;
        auditCounts.usersDeactivated = (auditCounts.usersDeactivated ?? 0) + auditUsersDeactivated.length;
        await saveMeta({ auditCounts });
    }
    await flush(93, 'Deactivation complete — starting verification');
};
export const cleanupCorrectionExport = async (c: Context, sessionId: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    await prisma.syncExportBlob.deleteMany({ where: { sessionId, NOT: { key: { startsWith: 'audit-' } } } });
};
export const syncPhaseCorrectionExport = async (c: Context, sessionId?: string, startPage = 1): Promise<{
    hadErrors: boolean;
    hasMore: boolean;
    lastPage: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    if (startPage === 1) {
        if (sessionId) {
            await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: null } }).catch(() => { });
        }
        await flush(94, 'Verifying against PeopleVine — exporting subscriptions', 'running');
        log('info', 'Starting post-sync verification pass');
        const { subscriptions, skippedSubPages } = await fetchAllPvData(c);
        if (skippedSubPages.length > 0)
            log('warn', `[verify] Subscription export skipped pages: [${skippedSubPages.join(', ')}]`);
        const subscriptionChunkKeys = await writeChunkedBlob(prisma, sessionId, 'subscriptions', subscriptions);
        const { cards: membershipCards, skippedPages: skippedCardPages } = await fetchAllMembershipCards(c);
        if (skippedCardPages.length > 0)
            log('warn', `[verify] Membership card export skipped pages: [${skippedCardPages.join(', ')}]`);
        const membershipCardChunkKeys = await writeChunkedBlob(prisma, sessionId, 'membership-cards', membershipCards);
        const { cards: allStatusCards, skippedPages: skippedAllStatusCardPages } = await fetchAllMembershipCards(c, null);
        if (skippedAllStatusCardPages.length > 0)
            log('warn', `[verify] Any-status card export skipped pages: [${skippedAllStatusCardPages.join(', ')}]`);
        const anyStatusPrimaryCards = allStatusCards.filter(card => card.primary === true);
        const anyStatusPrimaryCardChunkKeys = await writeChunkedBlob(prisma, sessionId, 'any-status-primary-cards', anyStatusPrimaryCards);
        const { subscriptions: allStatusSubscriptions, skippedSubPages: skippedAllStatusSubPages } = await fetchAllPvData(c, null);
        if (skippedAllStatusSubPages.length > 0)
            log('warn', `[verify] Any-status subscription export skipped pages: [${skippedAllStatusSubPages.join(', ')}]`);
        const attemptedSubscriberRecords = allStatusSubscriptions
            .filter(sub => sub?.customer?.id && sub.title)
            .map(sub => ({ customer_id: sub.customer.id, title: String(sub.title).trim() }));
        const attemptedSubscriberChunkKeys = await writeChunkedBlob(prisma, sessionId, 'attempted-subscribers', attemptedSubscriberRecords);
        const anyStatusSubscriptionChunkKeys = await writeChunkedBlob(prisma, sessionId, 'any-status-subscriptions', allStatusSubscriptions);
        if (sessionId) {
            await saveMeta({ subscriptionChunkKeys, membershipCardChunkKeys, anyStatusPrimaryCardChunkKeys, attemptedSubscriberChunkKeys, anyStatusSubscriptionChunkKeys });
        }
        await saveMeta({ correctionExportBatchKeys: [] });
    }
    await flush(95, `Exporting customers for verification (page ${startPage}+)`, 'running');
    const { customers: bulkCustomers, hadErrors, lastPage, hasMore } = await getCustomers(c, startPage, BATCH_PAGES);
    const customers = await resolvePlaceholderEmails(c, bulkCustomers);
    if (sessionId && customers.length > 0) {
        const newKeys = await writeChunkedBlob(prisma, sessionId, `customers-${String(startPage).padStart(6, '0')}`, customers);
        const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
        const meta: Record<string, any> = session ? JSON.parse(session.metadata ?? '{}') : {};
        const existingKeys: string[] = meta.correctionExportBatchKeys ?? [];
        await saveMeta({ correctionExportBatchKeys: [...existingKeys, ...newKeys], correctionExportLastPage: lastPage });
    }
    await flush(hasMore ? 96 : 97, hasMore ? `Verification export — fetched through page ${lastPage}` : 'Verification export complete', 'running');
    log('info', hasMore ? `Export batch done (pages ${startPage}–${lastPage}). Continuing from page ${lastPage + 1}.` : 'Verification export complete.');
    return { hadErrors, hasMore, lastPage };
};
export const syncPhaseCorrectionCompanies = async (c: Context, sessionId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    await flush(98, 'Verifying companies against PeopleVine', 'running');
    if (!sessionId) {
        await flush(98, 'Companies verified — verifying users', 'running');
        return;
    }
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
    const meta: Record<string, any> = session ? JSON.parse(session.metadata ?? '{}') : {};
    const subscriptions = await readChunkedBlob(prisma, sessionId, meta.subscriptionChunkKeys ?? []);
    const anyStatusSubscriptionsForRevenue = await readChunkedBlob(prisma, sessionId, meta.anyStatusSubscriptionChunkKeys ?? []);
    const membershipCardChunkKeys: string[] = meta.membershipCardChunkKeys ?? [];
    const membershipCards = await readChunkedBlob(prisma, sessionId, membershipCardChunkKeys);
    const correctionIndividualMembershipCardData = buildMembershipCardData(membershipCards);
    const attemptedSubscriberRecords = await readChunkedBlob(prisma, sessionId, meta.attemptedSubscriberChunkKeys ?? []) as {
        customer_id: number;
        title: string;
    }[];
    const dbCmtTypesForAttempted = await prisma.companyMembershipType.findMany({ select: { name: true } });
    const cmtNameSetForAttempted = new Set(dbCmtTypesForAttempted.map(t => t.name));
    const correctionAttemptedPVSubscriberIds = new Set<string>();
    for (const rec of attemptedSubscriberRecords) {
        if (cmtNameSetForAttempted.has(rec.title))
            correctionAttemptedPVSubscriberIds.add(rec.customer_id.toString());
    }
    const anyStatusPrimaryCards = await readChunkedBlob(prisma, sessionId, meta.anyStatusPrimaryCardChunkKeys ?? []);
    const correctionAnyStatusPrimaryTitle: Record<string, string> = {};
    for (const card of anyStatusPrimaryCards) {
        const customerId = card.customer_id?.toString();
        const title = (card.title ?? '').trim();
        if (!customerId || !title || correctionAnyStatusPrimaryTitle[customerId])
            continue;
        correctionAnyStatusPrimaryTitle[customerId] = title;
    }
    const { customers: companyProfiles, subscriptionInfoMap, individualSubscriberIds, portalAccessTypes } = await buildSubscriptionData(c, subscriptions);
    const dbCompanies = await prisma.company.findMany();
    const dbCompaniesMap = new Map<string, Company>();
    const dbCompaniesByName = new Map<string, Company>();
    for (const co of dbCompanies) {
        if (co.peopleVineId)
            dbCompaniesMap.set(co.peopleVineId, co);
        dbCompaniesByName.set(co.name.trim().toLowerCase(), co);
    }
    const auditCorrectionsCompanies: {
        id: string;
        name: string;
        pvId: string;
        changes: {
            field: string;
            before: string;
            after: string;
        }[];
    }[] = [];
    await runConcurrent(companyProfiles, 20, async (customer) => {
        const pvId = customer.id.toString();
        const subInfo = subscriptionInfoMap.get(pvId);
        const membershipTypes = subInfo?.membershipTypes ?? [];
        const isPersonal = customer.isPersonal ?? false;
        const isActive = subInfo?.isActive ?? false;
        const existingById = dbCompaniesMap.get(pvId);
        const existingByName = dbCompaniesByName.get(customer.company_name.trim().toLowerCase());
        const existing = existingById ?? existingByName;
        if (!existing)
            return;
        const coChanges: {
            field: string;
            before: string;
            after: string;
        }[] = [];
        const existingMTypes = JSON.parse(existing.membershipTypes || '[]') as string[];
        if (existing.name !== customer.company_name)
            coChanges.push({ field: 'name', before: existing.name, after: customer.company_name });
        if (existing.active !== isActive)
            coChanges.push({ field: 'active', before: String(existing.active), after: String(isActive) });
        if (JSON.stringify([...existingMTypes].sort()) !== JSON.stringify([...membershipTypes].sort()))
            coChanges.push({ field: 'membershipTypes', before: existingMTypes.join('; '), after: membershipTypes.join('; ') });
        if ((existing.isPersonal ?? false) !== isPersonal)
            coChanges.push({ field: 'isPersonal', before: String(existing.isPersonal), after: String(isPersonal) });
        if (coChanges.length === 0)
            return;
        await updateCompany(c, { id: existing.id, name: customer.company_name, active: isActive, membershipTypes, isPersonal, peopleVineId: existing.peopleVineId || pvId });
        auditCorrectionsCompanies.push({ id: existing.id, name: customer.company_name, pvId, changes: coChanges });
    }, () => checkCancelled(prisma, sessionId));
    const auditRevenueSynced: {
        peopleVineId: string;
        title: string;
        companyName: string | null;
        status: string;
    }[] = [];
    await runConcurrent(anyStatusSubscriptionsForRevenue, 20, async (sub) => {
        const pvId = sub.id?.toString();
        if (!pvId)
            return;
        // Raw subscription payloads carry the customer's own (sometimes personal) company_name as-is
        // — never routed through normalizeCustomers' "personal → X's Company" fallback used
        // everywhere else. Without applying the same rule here, a personal subscriber's revenue
        // record either matches nothing or, worse, matches an unrelated company that happens to be
        // literally named after them.
        const rawSubCompanyName = (sub.customer?.company_name ?? '').trim();
        const subCustomerFullName = (sub.customer?.full_name ?? '').trim();
        const subIsPersonal = rawSubCompanyName.length === 0 || rawSubCompanyName.toLowerCase() === subCustomerFullName.toLowerCase();
        const resolvedSubCompanyName = subIsPersonal
            ? (subCustomerFullName ? `${subCustomerFullName}'s Company` : (sub.customer?.id ? `PV #${sub.customer.id}'s Company` : ''))
            : rawSubCompanyName;
        const customerCompanyName = resolvedSubCompanyName ? normCompanyKey(resolvedSubCompanyName) : '';
        const matchedCompany = customerCompanyName ? dbCompaniesByName.get(customerCompanyName) : undefined;
        const data = {
            pvCustomerId: sub.customer?.id?.toString() ?? '',
            customerName: sub.customer?.full_name ?? null,
            companyId: matchedCompany?.id ?? null,
            title: sub.title ?? '',
            status: sub.status ?? '',
            currency: sub.currency ?? null,
            rate: sub.rate != null ? Number(sub.rate) : null,
            frequency: sub.frequency ?? null,
            pricing: sub.pricing ? JSON.stringify(sub.pricing) : null,
            lastDate: parsePvDate(sub.last_date),
            nextDate: parsePvDate(sub.next_date),
        };
        await prisma.subscription.upsert({
            where: { peopleVineId: pvId },
            create: { peopleVineId: pvId, ...data },
            update: data,
        });
        auditRevenueSynced.push({ peopleVineId: pvId, title: data.title, companyName: matchedCompany?.name ?? null, status: data.status });
    }, () => checkCancelled(prisma, sessionId));
    const correctionSubscriberMemberships: Record<string, string | null> = {};
    const correctionIndividualMembershipTypes: Record<string, string[]> = {};
    for (const [pvId, info] of subscriptionInfoMap.entries()) {
        const portalType = info.membershipTypes.find(t => portalAccessTypes.has(t));
        correctionSubscriberMemberships[pvId] = portalType ?? info.membershipTypes[0] ?? info.rawTitles[0] ?? null;
        correctionIndividualMembershipTypes[pvId] = info.membershipTypes.length > 0 ? info.membershipTypes : info.rawTitles;
    }
    const correctionIndividualMembershipTypesChunkKeys = await writeChunkedBlob(prisma, sessionId, 'phase4-membership-types', Object.entries(correctionIndividualMembershipTypes));
    const correctionIndividualMembershipCardDataChunkKeys = await writeChunkedBlob(prisma, sessionId, 'phase4-membership-card-data', Object.entries(correctionIndividualMembershipCardData));
    const correctionAnyStatusPrimaryTitleChunkKeys = await writeChunkedBlob(prisma, sessionId, 'phase4-any-status-primary-title', Object.entries(correctionAnyStatusPrimaryTitle));
    const correctionSubscriberMembershipsChunkKeys = await writeChunkedBlob(prisma, sessionId, 'phase4-subscriber-memberships', Object.entries(correctionSubscriberMemberships));
    await writeDataBlob(prisma, sessionId, 'phase4-data.json', {
        correctionAttemptedPVSubscriberIds: Array.from(correctionAttemptedPVSubscriberIds),
        correctionActivePVSubscriberIds: Array.from(individualSubscriberIds),
    });
    if (sessionId) {
        await saveMeta({ correctionIndividualMembershipTypesChunkKeys, correctionIndividualMembershipCardDataChunkKeys, correctionAnyStatusPrimaryTitleChunkKeys, correctionSubscriberMembershipsChunkKeys });
    }
    await appendAuditChunk(prisma, sessionId, 'correctionsCompanies', auditCorrectionsCompanies);
    await appendAuditChunk(prisma, sessionId, 'revenueSynced', auditRevenueSynced);
    const auditCounts: Record<string, number> = { ...(meta.auditCounts ?? {}) };
    auditCounts.correctionsCompanies = (auditCounts.correctionsCompanies ?? 0) + auditCorrectionsCompanies.length;
    auditCounts.revenueSynced = (auditCounts.revenueSynced ?? 0) + auditRevenueSynced.length;
    await saveMeta({ auditCounts });
    await flush(98, 'Companies verified — verifying users', 'running');
    log('info', `Verification: ${auditCorrectionsCompanies.length} compan${auditCorrectionsCompanies.length === 1 ? 'y' : 'ies'} corrected.`);
    log('info', `Revenue: ${auditRevenueSynced.length} subscription${auditRevenueSynced.length === 1 ? '' : 's'} mirrored.`);
};
export const syncPhaseCorrectionUsers = async (c: Context, sessionId?: string, startBatch = 0): Promise<{
    hasMore: boolean;
    nextBatch: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    const finish = async () => {
        if (sessionId) {
            await cleanupCorrectionExport(c, sessionId);
            await saveMeta({
                correctionExportBatchKeys: undefined,
                correctionExportLastPage: undefined,
                membershipCardChunkKeys: undefined,
                subscriptionChunkKeys: undefined,
                anyStatusPrimaryCardChunkKeys: undefined,
                attemptedSubscriberChunkKeys: undefined,
                anyStatusSubscriptionChunkKeys: undefined,
                correctionIndividualMembershipTypesChunkKeys: undefined,
                correctionIndividualMembershipCardDataChunkKeys: undefined,
                correctionAnyStatusPrimaryTitleChunkKeys: undefined,
                correctionSubscriberMembershipsChunkKeys: undefined,
            });
        }
        await flush(100, 'Done', 'completed');
        if (sessionId)
            await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => { });
    };
    if (!sessionId) {
        await finish();
        return { hasMore: false, nextBatch: startBatch };
    }
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
    const meta: Record<string, any> = session ? JSON.parse(session.metadata ?? '{}') : {};
    const batchKeys: string[] = meta.correctionExportBatchKeys ?? [];
    if (batchKeys.length === 0 || startBatch >= batchKeys.length) {
        await finish();
        return { hasMore: false, nextBatch: startBatch };
    }
    const phase4Blob = await prisma.syncExportBlob.findUnique({ where: { sessionId_key: { sessionId, key: 'phase4-data.json' } } });
    if (!phase4Blob) {
        throw new Error('phase4-data.json blob is missing — aborting correction batch to avoid writing incorrect primaryMembership/addOns from empty data');
    }
    const phase4Data = JSON.parse(phase4Blob.data) as {
        correctionAttemptedPVSubscriberIds: string[];
        correctionActivePVSubscriberIds: string[];
    };
    const correctionIndividualMembershipTypesEntries = await readChunkedBlob(prisma, sessionId, meta.correctionIndividualMembershipTypesChunkKeys ?? []) as [string, string[]][];
    const correctionIndividualMembershipTypes: Record<string, string[]> = Object.fromEntries(correctionIndividualMembershipTypesEntries);
    const correctionIndividualMembershipCardDataEntries = await readChunkedBlob(prisma, sessionId, meta.correctionIndividualMembershipCardDataChunkKeys ?? []) as [string, {
        ownTypes: string[];
        primaryCardTitle: string | null;
        primaryCardSourceCompanyName: string | null;
        allCardTypes: string[];
        secondaryProviders: {
            title: string;
            providingCompanyName: string | null;
        }[];
    }][];
    const correctionIndividualMembershipCardData: Record<string, {
        ownTypes: string[];
        primaryCardTitle: string | null;
        primaryCardSourceCompanyName: string | null;
        allCardTypes: string[];
        secondaryProviders: {
            title: string;
            providingCompanyName: string | null;
        }[];
    }> = Object.fromEntries(correctionIndividualMembershipCardDataEntries);
    const correctionAnyStatusPrimaryTitleEntries = await readChunkedBlob(prisma, sessionId, meta.correctionAnyStatusPrimaryTitleChunkKeys ?? []) as [string, string][];
    const correctionAnyStatusPrimaryTitle: Record<string, string> = Object.fromEntries(correctionAnyStatusPrimaryTitleEntries);
    const correctionActivePVSubscriberIds = new Set<string>(phase4Data.correctionActivePVSubscriberIds);
    const correctionAttemptedPVSubscriberIds = new Set<string>(phase4Data.correctionAttemptedPVSubscriberIds ?? []);
    await flush(98, `Verifying users (batch ${startBatch + 1}/${batchKeys.length})`, 'running');
    const dbCompanies = await prisma.company.findMany();
    const companiesByNameMap = new Map<string, Company>();
    for (const co of dbCompanies) {
        const key = normCompanyKey(co.name);
        const existing = companiesByNameMap.get(key);
        if (existing) {
            if (!existing.peopleVineId && co.peopleVineId)
                companiesByNameMap.set(key, co);
        }
        else {
            companiesByNameMap.set(key, co);
        }
    }
    const existingUsers = await prisma.user.findMany();
    const byPvId = new Map<string, User>();
    const byEmail = new Map<string, User>();
    for (const u of existingUsers) {
        if (u.peopleVineId)
            byPvId.set(u.peopleVineId, u);
        byEmail.set(u.email, u);
    }
    const dbPortalTypes = await prisma.companyMembershipType.findMany({ select: { name: true } });
    const portalTypeSet = new Set(dbPortalTypes.map(t => t.name));
    const dbPrimaryTypes = await prisma.primarySubscriptionType.findMany({ select: { name: true } });
    const primaryTypeSet = new Set(dbPrimaryTypes.map(t => t.name));
    const dbAddonTypes = await prisma.addonSubscriptionType.findMany({ select: { name: true } });
    const addonTypeSet = new Set(dbAddonTypes.map(t => t.name));
    const dbFreeMemberExclusions = await prisma.freeMemberExclusionType.findMany({ select: { name: true } });
    const freeMemberExclusionSet = new Set(dbFreeMemberExclusions.map(t => t.name));
    const getAddonTypes = (co: {
        membershipTypes: string;
    }): string[] => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        return types.filter(t => addonTypeSet.has(t));
    };
    const getPrimaryType = (co: {
        membershipTypes: string;
    }): string | null => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        const nonAddon = types.filter(t => !addonTypeSet.has(t));
        return types.find(t => primaryTypeSet.has(t)) ?? nonAddon.find(t => portalTypeSet.has(t)) ?? nonAddon[0] ?? null;
    };
    const companyQualifiesForFreeMember = (co: {
        membershipTypes: string;
    }): boolean => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        return types.some(t => (portalTypeSet.has(t) || primaryTypeSet.has(t)) && !freeMemberExclusionSet.has(t));
    };
    const blob = await prisma.syncExportBlob.findUnique({ where: { sessionId_key: { sessionId, key: batchKeys[startBatch] } } });
    const customers: PeopleVineCustomer[] = blob ? (JSON.parse(blob.data) as { items: PeopleVineCustomer[] }).items : [];
    const auditCorrectionsUsers: {
        id: string;
        name: string;
        email: string;
        companyId: string;
        changes: {
            field: string;
            before: string;
            after: string;
        }[];
    }[] = [];
    const auditMembershipTypeMismatches: {
        id: string;
        name: string;
        email: string;
        pvId: string;
        primaryMembership: string | null;
        addOns: string[];
        primaryCardFlagTitle: string | null;
        unmatchedCardTypes: string[];
    }[] = [];
    const auditSecondaryMemberships: {
        id: string;
        name: string;
        email: string;
        pvId: string;
        ownCompanyName: string;
        providingCompanyName: string;
        cardTitles: string[];
    }[] = [];
    const auditNotOnboarded: {
        id: string;
        name: string;
        email: string;
        pvId: string;
        companyName: string;
        active: boolean;
        primaryMembership: string | null;
    }[] = [];
    const auditNoPrimaryFlagged: {
        id: string;
        name: string;
        email: string;
        pvId: string;
        companyName: string;
        active: boolean;
        addOns: string[];
        candidateTypes: string[];
    }[] = [];
    await runConcurrent(customers, 20, async (customer) => {
        const pvId = customer.id.toString();
        const isSubscriber = correctionActivePVSubscriberIds.has(pvId);
        const isMember = customer.isMember ?? false;
        const company = companiesByNameMap.get(normCompanyKey(customer.company_name));
        if (!company)
            return;
        const existingUser = byPvId.get(pvId) ?? byEmail.get(customer.email.toLowerCase());
        if (!existingUser)
            return;
        if (existingUser.role === 'ADMIN')
            return;
        const memberSource = (isSubscriber || correctionAttemptedPVSubscriberIds.has(pvId)) ? 'subscription' : 'membership';
        const cardData = correctionIndividualMembershipCardData[pvId] ?? { ownTypes: [], primaryCardTitle: null, primaryCardSourceCompanyName: null, allCardTypes: [], secondaryProviders: [] };
        // A card whose parent_card_id points to someone else's card means a real company is
        // sponsoring this person's access — even when their own PV profile still lists their own
        // name as "company_name" (which would otherwise leave them wrongly classified as a direct
        // personal subscriber). Prefer that sponsor's existing non-personal company when found.
        const sponsorCompanyName = cardData.primaryCardSourceCompanyName?.trim() || null;
        const sponsorCompany = (customer.isPersonal && sponsorCompanyName)
            ? companiesByNameMap.get(normCompanyKey(sponsorCompanyName))
            : undefined;
        const resolvedCompany = (sponsorCompany && !sponsorCompany.isPersonal) ? sponsorCompany : company;
        const ownCompanyNameLower = company.name.trim().toLowerCase();
        const externalProviders = cardData.secondaryProviders.filter(sp => sp.providingCompanyName && sp.providingCompanyName.trim().toLowerCase() !== ownCompanyNameLower);
        let pvUserActive = (customer.pvActive ?? true) && (isMember
            ? companyQualifiesForFreeMember(company)
            : isSubscriber);
        if (!pvUserActive && (customer.pvActive ?? true)) {
            for (const sp of externalProviders) {
                const sponsor = companiesByNameMap.get(normCompanyKey(sp.providingCompanyName!));
                if (sponsor && sponsor.active !== false && companyQualifiesForFreeMember(sponsor)) {
                    pvUserActive = true;
                    break;
                }
            }
        }
        const ownMembershipTypesJson = JSON.stringify(correctionIndividualMembershipTypes[pvId] ?? []);
        const cardBasedPrimary = cardData.primaryCardTitle ?? correctionAnyStatusPrimaryTitle[pvId] ?? null;
        const ownPrimary = cardBasedPrimary ?? correctionIndividualMembershipTypes[pvId]?.[0] ?? null;
        // A free/non-rep member's own PV record has no subscription of their own, so `ownPrimary`
        // is null unless a rep's sync happened to cascade the company's membership type down to
        // them already. Fall back to the (possibly sponsor-resolved) company's membership types so
        // this member's own sync pass can also resolve "no primary membership" on its own.
        const companyFallbackPrimary = (memberSource === 'membership' && ownPrimary === null) ? getPrimaryType(resolvedCompany) : null;
        const newPrimary: string | null = ownPrimary ?? companyFallbackPrimary;
        const newPrimaryStatus: string | null = newPrimary === null
            ? null
            : (ownPrimary === null ? 'Active' : (cardBasedPrimary === null ? 'Active' : (cardData.primaryCardTitle !== null ? 'Active' : 'Cancelled')));
        const newMemberSourceCompany = newPrimary !== null
            ? (cardData.primaryCardSourceCompanyName ?? company.name)
            : company.name;
        const subscriptionAddOns = getAddonTypes({ membershipTypes: ownMembershipTypesJson });
        const cardAddOns = cardData.allCardTypes.filter(t => addonTypeSet.has(t) && t !== newPrimary);
        const companyFallbackAddOns = (memberSource === 'membership' && ownPrimary === null) ? getAddonTypes(resolvedCompany) : [];
        const newAddOns = Array.from(new Set([...subscriptionAddOns, ...companyFallbackAddOns, ...cardAddOns].filter(t => t !== newPrimary)));
        const recognizedTypes = new Set([...portalTypeSet, ...primaryTypeSet, ...addonTypeSet]);
        const primaryCandidateTypes = new Set([...portalTypeSet, ...primaryTypeSet]);
        const reflectedTypes = new Set([newPrimary, ...newAddOns].filter((t): t is string => !!t));
        const unmatchedCardTypes = cardData.allCardTypes.filter(t => {
            if (!recognizedTypes.has(t) || reflectedTypes.has(t))
                return false;
            if (newPrimary === null && primaryCandidateTypes.has(t))
                return false;
            return true;
        });
        if (unmatchedCardTypes.length > 0) {
            auditMembershipTypeMismatches.push({
                id: existingUser.id,
                name: customer.full_name,
                email: customer.email.toLowerCase(),
                pvId,
                primaryMembership: newPrimary,
                addOns: newAddOns,
                primaryCardFlagTitle: cardData.primaryCardTitle,
                unmatchedCardTypes,
            });
        }
        if (externalProviders.length > 0) {
            const titlesByProvider = new Map<string, string[]>();
            for (const sp of externalProviders) {
                const key = sp.providingCompanyName!;
                if (!titlesByProvider.has(key))
                    titlesByProvider.set(key, []);
                const titles = titlesByProvider.get(key)!;
                if (!titles.includes(sp.title))
                    titles.push(sp.title);
            }
            for (const [providingCompanyName, cardTitles] of titlesByProvider) {
                auditSecondaryMemberships.push({
                    id: existingUser.id,
                    name: customer.full_name,
                    email: customer.email.toLowerCase(),
                    pvId,
                    ownCompanyName: company.name,
                    providingCompanyName,
                    cardTitles,
                });
            }
        }
        const subscriptionTypes = correctionIndividualMembershipTypes[pvId] ?? [];
        const hasMembershipData = cardData.allCardTypes.length > 0 || subscriptionTypes.length > 0;
        if (!hasMembershipData) {
            auditNotOnboarded.push({
                id: existingUser.id,
                name: customer.full_name,
                email: customer.email.toLowerCase(),
                pvId,
                companyName: company.name,
                active: pvUserActive,
                primaryMembership: newPrimary,
            });
        }
        else if (newPrimary === null) {
            const candidateTypes = Array.from(new Set([
                ...cardData.allCardTypes.filter(t => !addonTypeSet.has(t) && (primaryTypeSet.has(t) || portalTypeSet.has(t))),
                ...subscriptionTypes.filter(t => !addonTypeSet.has(t) && (primaryTypeSet.has(t) || portalTypeSet.has(t))),
            ]));
            auditNoPrimaryFlagged.push({
                id: existingUser.id,
                name: customer.full_name,
                email: customer.email.toLowerCase(),
                pvId,
                companyName: company.name,
                active: pvUserActive,
                addOns: newAddOns,
                candidateTypes,
            });
        }
        const needsUpdate = existingUser.name !== customer.full_name ||
            existingUser.email !== customer.email.toLowerCase() ||
            existingUser.companyId !== resolvedCompany.id ||
            existingUser.primaryMembership !== newPrimary ||
            existingUser.primaryMembershipStatus !== newPrimaryStatus ||
            existingUser.addOns !== JSON.stringify(newAddOns) ||
            existingUser.active !== pvUserActive ||
            existingUser.profilePhoto !== (customer.profilePhoto ?? null) ||
            existingUser.username !== (customer.username ? customer.username.trim().toLowerCase() : null) ||
            existingUser.phone !== (customer.phone ?? null) ||
            existingUser.address !== (customer.address ?? null) ||
            existingUser.city !== (customer.city ?? null) ||
            existingUser.state !== (customer.state ?? null) ||
            existingUser.zipCode !== (customer.zipCode ?? null) ||
            existingUser.cardStatus !== (customer.cardStatus ?? null) ||
            existingUser.memberSource !== memberSource ||
            existingUser.memberSourceCompany !== newMemberSourceCompany;
        if (!needsUpdate)
            return;
        const uChanges: {
            field: string;
            before: string;
            after: string;
        }[] = [];
        const newEmailLower = customer.email.toLowerCase();
        const newAddOnsJson = JSON.stringify(newAddOns);
        const newUsername = customer.username ? customer.username.trim().toLowerCase() : null;
        if (existingUser.name !== customer.full_name)
            uChanges.push({ field: 'name', before: existingUser.name, after: customer.full_name });
        if (existingUser.email !== newEmailLower)
            uChanges.push({ field: 'email', before: existingUser.email, after: newEmailLower });
        if (existingUser.active !== pvUserActive)
            uChanges.push({ field: 'active', before: String(existingUser.active), after: String(pvUserActive) });
        if (existingUser.companyId !== resolvedCompany.id)
            uChanges.push({ field: 'company', before: existingUser.companyId, after: resolvedCompany.id });
        if (existingUser.primaryMembership !== newPrimary)
            uChanges.push({ field: 'primaryMembership', before: String(existingUser.primaryMembership), after: String(newPrimary) });
        if (existingUser.primaryMembershipStatus !== newPrimaryStatus)
            uChanges.push({ field: 'primaryMembershipStatus', before: String(existingUser.primaryMembershipStatus), after: String(newPrimaryStatus) });
        if (existingUser.addOns !== newAddOnsJson)
            uChanges.push({ field: 'addOns', before: existingUser.addOns || '[]', after: newAddOnsJson });
        if (existingUser.memberSource !== memberSource)
            uChanges.push({ field: 'memberSource', before: String(existingUser.memberSource), after: memberSource });
        if (existingUser.memberSourceCompany !== newMemberSourceCompany)
            uChanges.push({ field: 'memberSourceCompany', before: String(existingUser.memberSourceCompany), after: newMemberSourceCompany });
        if (existingUser.username !== newUsername)
            uChanges.push({ field: 'username', before: String(existingUser.username), after: String(newUsername) });
        if (existingUser.phone !== (customer.phone ?? null))
            uChanges.push({ field: 'phone', before: String(existingUser.phone), after: String(customer.phone ?? null) });
        if (existingUser.address !== (customer.address ?? null))
            uChanges.push({ field: 'address', before: String(existingUser.address), after: String(customer.address ?? null) });
        if (existingUser.city !== (customer.city ?? null))
            uChanges.push({ field: 'city', before: String(existingUser.city), after: String(customer.city ?? null) });
        if (existingUser.state !== (customer.state ?? null))
            uChanges.push({ field: 'state', before: String(existingUser.state), after: String(customer.state ?? null) });
        if (existingUser.zipCode !== (customer.zipCode ?? null))
            uChanges.push({ field: 'zipCode', before: String(existingUser.zipCode), after: String(customer.zipCode ?? null) });
        if (existingUser.cardStatus !== (customer.cardStatus ?? null))
            uChanges.push({ field: 'cardStatus', before: String(existingUser.cardStatus), after: String(customer.cardStatus ?? null) });
        const userUpdatePayload: Record<string, any> = {
            id: existingUser.id,
            name: customer.full_name,
            email: customer.email,
            username: customer.username ?? null,
            companyId: resolvedCompany.id,
            peopleVineId: pvId,
            primaryMembership: newPrimary,
            primaryMembershipStatus: newPrimaryStatus,
            addOns: newAddOns,
            profilePhoto: customer.profilePhoto,
            active: pvUserActive,
            phone: customer.phone ?? null,
            address: customer.address ?? null,
            city: customer.city ?? null,
            state: customer.state ?? null,
            zipCode: customer.zipCode ?? null,
            cardStatus: customer.cardStatus ?? null,
            memberSource,
            memberSourceCompany: newMemberSourceCompany,
        };
        try {
            await updateUser(c, userUpdatePayload as any);
            auditCorrectionsUsers.push({ id: existingUser.id, name: customer.full_name, email: newEmailLower, companyId: resolvedCompany.id, changes: uChanges });
        }
        catch (e) {
            if (!isUniqueConstraintError(e)) {
                throw e;
            }
            // See syncOne — a stale/duplicate value on any one unique field used to silently
            // abort this whole user's correction pass, blocking unrelated fixes.
            const conflictingField = getUniqueConstraintField(e);
            const conflictDetail = await describeUniqueConflict(prisma, conflictingField, userUpdatePayload);
            log('warn', `[sync] Unique constraint conflict updating user ${customer.full_name} (PV#${pvId}) on ${conflictDetail}.`);
            if (conflictingField && conflictingField in userUpdatePayload) {
                const retryPayload = { ...userUpdatePayload };
                delete retryPayload[conflictingField];
                try {
                    await updateUser(c, retryPayload as any);
                    auditCorrectionsUsers.push({ id: existingUser.id, name: customer.full_name, email: newEmailLower, companyId: resolvedCompany.id, changes: uChanges });
                }
                catch (retryError) {
                    log('warn', `[sync] Retry without "${conflictingField}" still failed for ${customer.full_name}.`);
                    if (!isUniqueConstraintError(retryError))
                        throw retryError;
                }
            }
        }
    }, () => checkCancelled(prisma, sessionId));
    await appendAuditChunk(prisma, sessionId, 'correctionsUsers', auditCorrectionsUsers);
    await appendAuditChunk(prisma, sessionId, 'membershipTypeMismatches', auditMembershipTypeMismatches);
    await appendAuditChunk(prisma, sessionId, 'secondaryMemberships', auditSecondaryMemberships);
    await appendAuditChunk(prisma, sessionId, 'notOnboarded', auditNotOnboarded);
    await appendAuditChunk(prisma, sessionId, 'noPrimaryFlagged', auditNoPrimaryFlagged);
    const auditCounts: Record<string, number> = { ...(meta.auditCounts ?? {}) };
    auditCounts.correctionsUsers = (auditCounts.correctionsUsers ?? 0) + auditCorrectionsUsers.length;
    auditCounts.membershipTypeMismatches = (auditCounts.membershipTypeMismatches ?? 0) + auditMembershipTypeMismatches.length;
    auditCounts.secondaryMemberships = (auditCounts.secondaryMemberships ?? 0) + auditSecondaryMemberships.length;
    auditCounts.notOnboarded = (auditCounts.notOnboarded ?? 0) + auditNotOnboarded.length;
    auditCounts.noPrimaryFlagged = (auditCounts.noPrimaryFlagged ?? 0) + auditNoPrimaryFlagged.length;
    await saveMeta({ auditCounts });
    log('info', `Verification batch ${startBatch + 1}/${batchKeys.length}: ${auditCorrectionsUsers.length} user(s) corrected.`);
    const nextBatch = startBatch + 1;
    if (nextBatch < batchKeys.length) {
        await flush(98, `Verifying users (batch ${nextBatch + 1}/${batchKeys.length})`, 'running');
        return { hasMore: true, nextBatch };
    }
    await finish();
    return { hasMore: false, nextBatch };
};
export const syncOne = async (c: Context, peopleVineId: number, webhookLogId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    console.log(`Syncing customer with PeopleVine ID ${peopleVineId}`);
    const [customer, subResult, cardResult, anyStatusCardResult, anyStatusSubResult] = await Promise.all([
        getCustomer(c, peopleVineId.toString()),
        getCustomersFromSubscriptions(c, peopleVineId.toString()),
        fetchAllMembershipCards(c),
        fetchAllMembershipCards(c, null),
        getCustomersFromSubscriptions(c, peopleVineId.toString(), null),
    ]);
    if (!customer) {
        console.log(`Customer ${peopleVineId} not found in PV — deactivating if present in DB.`);
        const existingCompany = await prisma.company.findFirst({ where: { peopleVineId: String(peopleVineId) } });
        // System/internal tracking accounts (e.g. an admin's PV placeholder used to track spaces
        // mHUB pays for on members' behalf) may be intentionally missing from PV — PV "not found"
        // for these doesn't mean the member left, so never auto-deactivate them from here.
        if (existingCompany?.active && !existingCompany.isSystemAccount) {
            await deactivateCompany(c, existingCompany.id);
            if (webhookLogId) {
                await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify({ company: { before: { active: true }, after: { active: false } } }) } }).catch(() => { });
            }
            return;
        }
        const existingUser = await prisma.user.findFirst({ where: { peopleVineId: String(peopleVineId) } });
        if (existingUser?.active && existingUser.role !== 'ADMIN' && !existingUser.isSystemAccount) {
            await deactivateUser(c, existingUser.id);
            if (webhookLogId) {
                await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify({ user: { before: { active: true }, after: { active: false } } }) } }).catch(() => { });
            }
        }
        return;
    }
    const pvId = customer.id.toString();
    const hasSubInfo = subResult.subscriptionInfoMap.has(pvId);
    const subInfo = subResult.subscriptionInfoMap.get(pvId);
    const membershipTypes = (subInfo?.membershipTypes.length ?? 0) > 0 ? subInfo!.membershipTypes : (subInfo?.rawTitles ?? []);
    const portalAccessTypes = subResult.portalAccessTypes;
    const prismaForSync: PrismaClient = c.get('db');
    const [dbPrimaryTypesSync, dbAddonTypesSync, dbFreeMemberExclusionsSync] = await Promise.all([
        prismaForSync.primarySubscriptionType.findMany({ select: { name: true } }),
        prismaForSync.addonSubscriptionType.findMany({ select: { name: true } }),
        prismaForSync.freeMemberExclusionType.findMany({ select: { name: true } }),
    ]);
    const primaryTypeSetSync = new Set(dbPrimaryTypesSync.map(t => t.name));
    const addonTypeSetSync = new Set(dbAddonTypesSync.map(t => t.name));
    const freeMemberExclusionSetSync = new Set(dbFreeMemberExclusionsSync.map(t => t.name));
    const cardDataSync = buildMembershipCardData(cardResult.cards)[pvId]
        ?? { ownTypes: [], primaryCardTitle: null, primaryCardSourceCompanyName: null, allCardTypes: [], secondaryProviders: [] };
    const anyStatusPrimaryCard = anyStatusCardResult.cards.find(card => card.customer_id?.toString() === pvId && card.primary === true);
    const anyStatusPrimaryTitle = (anyStatusPrimaryCard?.title ?? '').trim() || null;
    const pickBest = (types: string[]): string | null => types.find(t => primaryTypeSetSync.has(t)) ?? types.find(t => portalAccessTypes.has(t)) ?? types[0] ?? null;
    const pickAddons = (types: string[]): string[] => types.filter(t => addonTypeSetSync.has(t));
    const membershipType = cardDataSync.primaryCardTitle ?? anyStatusPrimaryTitle ?? pickBest(membershipTypes);
    const membershipStatus: string | null = membershipType === null
        ? null
        : (cardDataSync.primaryCardTitle !== null ? 'Active' : (anyStatusPrimaryTitle !== null ? 'Cancelled' : 'Active'));
    const isPersonal = customer.isPersonal ?? false;
    const diffRecord: Record<string, {
        before: any;
        after: any;
    }> = {};
    const existingCompanyByPvId = await prisma.company.findFirst({ where: { peopleVineId: pvId } });
    const existingCompanyByName = await findCompanyByNameCI(prisma, customer.company_name);
    const hasCompanyLevelSub = subResult.customers.some(cu => cu.id.toString() === pvId);
    const hasOwnCmtSubAttempt = (anyStatusSubResult.subscriptionInfoMap.get(pvId)?.attemptedTypes.length ?? 0) > 0;
    const isCompanyRep = existingCompanyByPvId !== null || hasCompanyLevelSub || hasOwnCmtSubAttempt;
    const subIsActive = hasSubInfo ? subInfo!.isActive : (subResult.hadErrors || customer.isMember === true);
    const pvActive = isCompanyRep
        ? ((customer.pvActive ?? true) && subIsActive)
        : (customer.pvActive ?? true);
    const nameFoundIsRep = existingCompanyByName && !existingCompanyByName.peopleVineId;
    const repCompanyCandidate = existingCompanyByPvId ?? (nameFoundIsRep ? existingCompanyByName : null);
    const rawCompanyNameUnchanged = repCompanyCandidate
        ? repCompanyCandidate.name.trim().toLowerCase() === (customer.rawCompanyName ?? customer.company_name).trim().toLowerCase()
        : false;
    const movingToPersonal = repCompanyCandidate && !repCompanyCandidate.active && isPersonal && !repCompanyCandidate.isPersonal && !rawCompanyNameUnchanged;
    const companyForRepOps = movingToPersonal ? null : repCompanyCandidate;
    if (isCompanyRep) {
        if (!pvActive && companyForRepOps && companyForRepOps.active) {
            console.log(`Customer ${customer.id} has no active subscription. Deactivating company ${companyForRepOps.name}.`);
            diffRecord.company = { before: { active: true }, after: { active: false } };
            if (webhookLogId) {
                await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify(diffRecord) } }).catch(() => { });
            }
            await deactivateCompany(c, companyForRepOps.id);
            return;
        }
        if (companyForRepOps) {
            console.log(`Updating company ${companyForRepOps.name}.`);
            const wasInactive = !companyForRepOps.active;
            const existingTypes: string[] = JSON.parse(companyForRepOps.membershipTypes || '[]');
            const newMembershipTypes = hasSubInfo ? membershipTypes : existingTypes;
            // Webhook-driven syncs only touch the one customer that changed in PV, so a company's
            // placeholder email (assigned when it was first created without a real email) is only
            // ever fixed here — the full "Sync All" isn't the only path that needs to resolve it.
            const isPlaceholderCompanyEmail = companyForRepOps.email.endsWith('@placeholder.invalid') || companyForRepOps.email.endsWith('@noemail.mhub');
            const resolvedCompanyEmail = isPlaceholderCompanyEmail && customer.email ? customer.email.toLowerCase() : undefined;
            diffRecord.company = {
                before: { name: companyForRepOps.name, active: companyForRepOps.active, membershipTypes: existingTypes, isPersonal: companyForRepOps.isPersonal, email: companyForRepOps.email },
                after: { name: customer.company_name, active: pvActive, membershipTypes: newMembershipTypes, isPersonal, email: resolvedCompanyEmail ?? companyForRepOps.email },
            };
            await updateCompany(c, {
                id: companyForRepOps.id,
                name: customer.company_name,
                active: pvActive,
                membershipTypes: newMembershipTypes,
                isPersonal,
                peopleVineId: pvId,
                email: resolvedCompanyEmail,
            });
            if (wasInactive && pvActive) {
                console.log(`Reactivating subscribers for company ${companyForRepOps.name}.`);
                await prisma.user.updateMany({ where: { companyId: companyForRepOps.id, memberSource: 'subscription' }, data: { active: true } });
            }
            const typesChanged = JSON.stringify([...newMembershipTypes].sort()) !== JSON.stringify([...existingTypes].sort());
            if (hasSubInfo && typesChanged) {
                console.log(`Cascading membership type change to non-subscriber members of company ${companyForRepOps.name}.`);
                await prisma.user.updateMany({ where: { companyId: companyForRepOps.id, memberSource: 'membership' }, data: { primaryMembership: pickBest(newMembershipTypes), addOns: JSON.stringify(pickAddons(newMembershipTypes)) } });
            }
        }
    }
    const baseCompany = movingToPersonal ? null : (repCompanyCandidate ?? existingCompanyByName);
    // A card whose parent_card_id points to someone else's card means a real company is sponsoring
    // this person's access — even when their own PV profile still lists their own name as
    // "company_name" (which would otherwise leave them wrongly classified as a direct personal
    // subscriber, since `isPersonal` only looks at that field). When we can match the sponsor to an
    // existing real company, prefer it over the person's own personal placeholder company.
    const sponsorCompanyName = cardDataSync.primaryCardSourceCompanyName?.trim() || null;
    const sponsorCompanyMatch = (isPersonal && sponsorCompanyName) ? await findCompanyByNameCI(prisma, sponsorCompanyName) : null;
    const sponsorCompany = (sponsorCompanyMatch && !sponsorCompanyMatch.isPersonal) ? sponsorCompanyMatch : null;
    let associatedCompany = sponsorCompany ?? baseCompany ?? await prisma.company.findFirst({ where: { name: customer.company_name } });
    if (!associatedCompany) {
        if (!isCompanyRep || !pvActive) {
            console.log(`No company found for ${customer.full_name} — sub-member or inactive, skipping.`);
            return;
        }
        console.log(`Creating new company for ${customer.company_name}.`);
        diffRecord.company = {
            before: null,
            after: { name: customer.company_name, active: true, membershipTypes: membershipTypes, isPersonal },
        };
        try {
            associatedCompany = await createCompany(c, {
                name: customer.company_name,
                peopleVineId: pvId,
                active: true,
                email: customer.email.toLowerCase(),
                membershipTypes: membershipTypes,
                isPersonal,
            });
        }
        catch (e) {
            if (isUniqueConstraintError(e)) {
                associatedCompany = await prisma.company.findFirst({ where: { OR: [{ peopleVineId: pvId }, { name: customer.company_name }] } });
                if (!associatedCompany)
                    return;
            }
            else {
                throw e;
            }
        }
    }
    const companyQualifiesForFreeMemberSync = (co: {
        membershipTypes: string;
    }): boolean => {
        const types = JSON.parse(co.membershipTypes || '[]') as string[];
        return types.some(t => (portalAccessTypes.has(t) || primaryTypeSetSync.has(t)) && !freeMemberExclusionSetSync.has(t));
    };
    const memberSource = isCompanyRep ? 'subscription' : 'membership';
    const freeMemberAllowed = isCompanyRep ? true : companyQualifiesForFreeMemberSync(associatedCompany);
    let userPvActive = isCompanyRep ? pvActive : (pvActive && (associatedCompany.active !== false) && freeMemberAllowed);
    if (!userPvActive && (customer.pvActive ?? true)) {
        const ownCompanyNameLowerSync = associatedCompany.name.trim().toLowerCase();
        const externalProvidersSync = cardDataSync.secondaryProviders.filter(sp => sp.providingCompanyName && sp.providingCompanyName.trim().toLowerCase() !== ownCompanyNameLowerSync);
        for (const sp of externalProvidersSync) {
            const sponsor = await prisma.company.findFirst({ where: { name: sp.providingCompanyName! } });
            if (sponsor && sponsor.active !== false && companyQualifiesForFreeMemberSync(sponsor)) {
                userPvActive = true;
                break;
            }
        }
    }
    // A free/non-rep member's own PV record has no subscription of their own, so `membershipType`
    // (derived from their own cards/subscriptions) is null unless the rep's webhook happens to have
    // cascaded the company's membership type down to them already (see the cascade above, which
    // only fires when the rep's own types just changed). Firing a webhook for the member themselves
    // used to leave them stuck with no primary membership forever — fall back to the company's
    // membership types here too, so their own webhook event can also resolve it.
    const companyMembershipTypesForFallback: string[] = isCompanyRep ? [] : JSON.parse(associatedCompany.membershipTypes || '[]');
    const userPrimaryMembership = membershipType ?? pickBest(companyMembershipTypesForFallback);
    // `membershipStatus` only reflects the member's own subscription/card, so it stays null in the
    // same fallback case. The company's membershipTypes list only ever holds currently-active types,
    // so a primary sourced from it is always "Active".
    const userPrimaryMembershipStatus = membershipType !== null ? membershipStatus : (userPrimaryMembership !== null ? 'Active' : null);
    const cardAddOnsSync = cardDataSync.allCardTypes.filter(t => addonTypeSetSync.has(t) && t !== userPrimaryMembership);
    const userAddOns = Array.from(new Set([
        ...pickAddons(membershipTypes),
        ...pickAddons(companyMembershipTypesForFallback),
        ...cardAddOnsSync,
    ].filter(t => t !== userPrimaryMembership)));
    const userMemberSourceCompany = cardDataSync.primaryCardSourceCompanyName ?? associatedCompany.name;
    const userByPvId = await prisma.user.findFirst({ where: { peopleVineId: customer.id.toString() } });
    const userByEmail = await prisma.user.findFirst({ where: { email: customer.email.toLowerCase() } });
    const associatedUser = userByPvId ?? userByEmail;
    if (associatedUser && associatedUser.role === 'ADMIN') {
        diffRecord.user = { before: null, after: null };
    }
    else if (associatedUser) {
        const needsUpdate = associatedUser.name !== customer.full_name ||
            associatedUser.email !== customer.email.toLowerCase() ||
            associatedUser.username !== (customer.username ? customer.username.trim().toLowerCase() : null) ||
            associatedUser.companyId !== associatedCompany.id ||
            associatedUser.primaryMembership !== userPrimaryMembership ||
            associatedUser.primaryMembershipStatus !== userPrimaryMembershipStatus ||
            associatedUser.addOns !== JSON.stringify(userAddOns) ||
            associatedUser.active !== userPvActive ||
            associatedUser.profilePhoto !== (customer.profilePhoto ?? null) ||
            associatedUser.phone !== (customer.phone ?? null) ||
            associatedUser.address !== (customer.address ?? null) ||
            associatedUser.city !== (customer.city ?? null) ||
            associatedUser.state !== (customer.state ?? null) ||
            associatedUser.zipCode !== (customer.zipCode ?? null) ||
            associatedUser.cardStatus !== (customer.cardStatus ?? null) ||
            associatedUser.memberSource !== memberSource ||
            associatedUser.memberSourceCompany !== userMemberSourceCompany ||
            (userByEmail && !userByEmail.peopleVineId);
        const userAfterSnapshot = {
            name: customer.full_name,
            email: customer.email.toLowerCase(),
            username: customer.username ? customer.username.trim().toLowerCase() : null,
            active: userPvActive,
            primaryMembership: userPrimaryMembership,
            primaryMembershipStatus: userPrimaryMembershipStatus,
            addOns: userAddOns,
            phone: customer.phone ?? null,
            address: customer.address ?? null,
            city: customer.city ?? null,
            state: customer.state ?? null,
            zipCode: customer.zipCode ?? null,
            cardStatus: customer.cardStatus ?? null,
            profilePhoto: customer.profilePhoto ?? null,
            memberSourceCompany: userMemberSourceCompany,
        };
        if (needsUpdate) {
            console.log(`Updating user ${customer.full_name} (${customer.email}).`);
            diffRecord.user = {
                before: {
                    name: associatedUser.name,
                    email: associatedUser.email,
                    username: associatedUser.username,
                    active: associatedUser.active,
                    primaryMembership: associatedUser.primaryMembership,
                    primaryMembershipStatus: associatedUser.primaryMembershipStatus,
                    addOns: associatedUser.addOns,
                    phone: associatedUser.phone,
                    address: associatedUser.address,
                    city: associatedUser.city,
                    state: associatedUser.state,
                    zipCode: associatedUser.zipCode,
                    cardStatus: associatedUser.cardStatus,
                    profilePhoto: associatedUser.profilePhoto,
                    memberSourceCompany: associatedUser.memberSourceCompany,
                },
                after: userAfterSnapshot,
            };
            const userUpdatePayload: Record<string, any> = {
                id: associatedUser.id,
                name: customer.full_name,
                email: customer.email,
                username: customer.username ?? null,
                companyId: associatedCompany.id,
                peopleVineId: customer.id.toString(),
                primaryMembership: userPrimaryMembership,
                primaryMembershipStatus: userPrimaryMembershipStatus,
                addOns: userAddOns,
                profilePhoto: customer.profilePhoto,
                active: userPvActive,
                phone: customer.phone ?? null,
                address: customer.address ?? null,
                city: customer.city ?? null,
                state: customer.state ?? null,
                zipCode: customer.zipCode ?? null,
                cardStatus: customer.cardStatus ?? null,
                memberSource,
                memberSourceCompany: userMemberSourceCompany,
            };
            try {
                await updateUser(c, userUpdatePayload as any);
            }
            catch (e) {
                if (isUniqueConstraintError(e)) {
                    // D1's error names the actual column (e.g. "User.username"), which isn't
                    // always email — a stale/duplicate value on any of the three unique fields
                    // used to abort the *entire* update, silently blocking unrelated fixes (like
                    // primaryMembership) that had nothing to do with the conflict. Retry with just
                    // that one field left untouched instead of giving up on the whole sync.
                    const conflictingField = getUniqueConstraintField(e);
                    const conflictDetail = await describeUniqueConflict(prisma, conflictingField, userUpdatePayload);
                    console.warn(`[syncOne] Unique constraint conflict updating user ${customer.full_name} (PV#${pvId}) on ${conflictDetail}.`);
                    if (conflictingField && conflictingField in userUpdatePayload) {
                        console.warn(`[syncOne] Retrying update for ${customer.full_name} without "${conflictingField}".`);
                        const retryPayload = { ...userUpdatePayload };
                        delete retryPayload[conflictingField];
                        try {
                            await updateUser(c, retryPayload as any);
                        }
                        catch (retryError) {
                            console.error(`[syncOne] Retry without "${conflictingField}" still failed for ${customer.full_name}:`, retryError);
                        }
                    }
                    return;
                }
                throw e;
            }
        }
        else {
            diffRecord.user = { before: userAfterSnapshot, after: userAfterSnapshot };
        }
    }
    else {
        if (!userPvActive) {
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
                active: userPvActive,
                phone: customer.phone ?? null,
                address: customer.address ?? null,
                city: customer.city ?? null,
                state: customer.state ?? null,
                zipCode: customer.zipCode ?? null,
                cardStatus: customer.cardStatus ?? null,
                profilePhoto: customer.profilePhoto ?? null,
                memberSourceCompany: userMemberSourceCompany,
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
                primaryMembership: userPrimaryMembership,
                primaryMembershipStatus: userPrimaryMembershipStatus,
                addOns: userAddOns,
                profilePhoto: customer.profilePhoto,
                active: userPvActive,
                phone: customer.phone ?? null,
                address: customer.address ?? null,
                city: customer.city ?? null,
                state: customer.state ?? null,
                zipCode: customer.zipCode ?? null,
                cardStatus: customer.cardStatus ?? null,
                memberSource,
                memberSourceCompany: userMemberSourceCompany,
            });
        }
        catch (e) {
            if (isUniqueConstraintError(e)) {
                const conflictingField = getUniqueConstraintField(e);
                const conflictDetail = await describeUniqueConflict(prisma, conflictingField, { email: customer.email, username: customer.username ?? null });
                console.warn(`[syncOne] Unique constraint conflict creating user ${customer.full_name} (PV#${pvId}) on ${conflictDetail}.`);
                return;
            }
            throw e;
        }
    }
    if (associatedCompany.active !== false && companyQualifiesForFreeMemberSync(associatedCompany)) {
        const ownCompanyNameLowerForSponsor = associatedCompany.name.trim().toLowerCase();
        const ownCardIds = cardResult.cards
            .filter(card => (card.customer_company_name ?? '').trim().toLowerCase() === ownCompanyNameLowerForSponsor)
            .map(card => card.id);
        if (ownCardIds.length > 0) {
            const sponsoredCustomerIds = new Set(cardResult.cards
                .filter(card => ownCardIds.includes(card.parent_card_id))
                .map(card => card.customer_id?.toString())
                .filter((id): id is string => !!id && id !== pvId));
            for (const sponsoredPvId of sponsoredCustomerIds) {
                const sponsoredUser = await prisma.user.findFirst({ where: { peopleVineId: sponsoredPvId } });
                if (sponsoredUser && !sponsoredUser.active) {
                    console.log(`Activating ${sponsoredUser.name} via cross-company sponsorship from ${associatedCompany.name}.`);
                    await updateUser(c, { id: sponsoredUser.id, active: true });
                }
            }
        }
    }
    diffRecord.subscription = {
        before: {
            membershipTypes: hasSubInfo ? membershipTypes : '(no data)',
            isActive: hasSubInfo ? (subInfo?.isActive ?? false) : '(no data)',
        },
        after: {
            membershipTypes: hasSubInfo ? membershipTypes : '(no data)',
            isActive: hasSubInfo ? (subInfo?.isActive ?? false) : '(no data)',
        },
    };
    if (webhookLogId && Object.keys(diffRecord).length > 0) {
        await (prisma.webhookLog.update as any)({ where: { id: webhookLogId }, data: { diff: JSON.stringify(diffRecord) } }).catch(() => { });
    }
    console.log(`Sync for customer with PeopleVine ID ${peopleVineId} complete.`);
};
interface CompanyImport {
    subscriptionNo: string;
    companyName: string;
    primaryMembership: string | null;
}
interface MemberImport {
    customerNo: string;
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
    username: string | null;
}
export const syncFiltered = async (c: Context, companies: CompanyImport[], members: MemberImport[], sessionId?: string): Promise<{
    companiesCreated: number;
    errors: string[];
}> => {
    const prisma: PrismaClient = c.get('db');
    const { log, flush, saveMeta } = makeSessionFlusher(prisma, sessionId);
    try {
        log('info', `Starting filtered import: ${companies.length} companies, ${members.length} members`);
        await flush(5, 'Creating companies');
        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        const errors: string[] = [];
        let companiesCreated = 0;
        const existingDbCos = await prisma.company.findMany({ select: { id: true, name: true, peopleVineId: true } });
        const existingByNormName = new Map<string, {
            id: string;
            peopleVineId: string | null;
        }>(existingDbCos.map(co => [normalize(co.name), { id: co.id, peopleVineId: co.peopleVineId }]));
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
                        membershipTypes: co.primaryMembership ? [co.primaryMembership] : [],
                        isPersonal: false,
                    });
                    existingByNormName.set(key, { id: created.id, peopleVineId: null });
                    companiesCreated++;
                }
                catch (e) {
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
        let subsDone = 0;
        for (const co of companies) {
            await checkCancelled(prisma, sessionId);
            const key = normalize(co.companyName);
            const existing = existingByNormName.get(key);
            if (!existing || existing.peopleVineId || !co.subscriptionNo) {
                subsDone++;
                continue;
            }
            let sub: any = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    sub = await apiRequest(c, {
                        tokenType: PeopleVineTokenType.USER_COMPANY,
                        endpoint: `/subscriptions/${co.subscriptionNo}`,
                        method: 'GET',
                    });
                    break;
                }
                catch (err) {
                    if (attempt < 2)
                        await sleep(1000 * (attempt + 1));
                }
            }
            if (sub?.customer) {
                const pvId = String(sub.customer.id);
                try {
                    await prisma.company.update({ where: { id: existing.id }, data: { peopleVineId: pvId } });
                    existing.peopleVineId = pvId;
                }
                catch { }
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
    }
    catch (err) {
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
            }
            catch { }
        }
        throw err;
    }
};
const FILTERED_MEMBER_BATCH = 300;
export const syncFilteredMembers = async (c: Context, sessionId: string, startOffset: number): Promise<{
    hasMore: boolean;
    nextOffset: number;
}> => {
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
    const dbCos = await prisma.company.findMany({ select: { id: true, name: true, membershipTypes: true } });
    const dbCoByNormName = new Map(dbCos.map(co => [normalize(co.name), co]));
    let usersCreated = 0;
    let usersSkipped = 0;
    for (const m of batch) {
        await checkCancelled(prisma, sessionId);
        const companyKey = normalize(m.companyName);
        const dbCompany = dbCoByNormName.get(companyKey);
        if (!dbCompany) {
            usersSkipped++;
            continue;
        }
        const email = m.email?.toLowerCase();
        if (!email) {
            usersSkipped++;
            continue;
        }
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
                primaryMembership: (JSON.parse(dbCompany.membershipTypes || '[]') as string[])[0] ?? null,
                profilePhoto: null,
            });
            usersCreated++;
        }
        catch (e) {
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
    }
    else {
        log('info', `Import complete: ${runningCreated} users created, ${runningSkipped} skipped`);
        await flush(100, 'Complete', 'completed');
        await prisma.syncSession.update({ where: { id: sessionId }, data: { completedAt: new Date() } }).catch(() => { });
    }
    return { hasMore, nextOffset };
};
const PV_PAGE_SIZE = 100;
export const fetchPvPage = async (c: Context, endpoint: string, page: number, extraParams?: Record<string, string>): Promise<any[] | null> => {
    for (let attempt = 0; attempt < PV_MAX_RETRIES; attempt++) {
        try {
            const result = await apiRequest(c, {
                tokenType: PeopleVineTokenType.USER_COMPANY,
                endpoint,
                method: 'GET',
                queryParams: { page_size: String(PV_PAGE_SIZE), page_number: String(page), ...extraParams },
            });
            return Array.isArray(result) ? result : [];
        }
        catch (err) {
            console.error(`[fetchPvPage] ${endpoint} page ${page} attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : String(err));
            if (attempt < PV_MAX_RETRIES - 1)
                await sleep(1000 * (attempt + 1));
        }
    }
    return null;
};
export const fetchAllPvData = async (c: Context, statusFilter: string | null = 'active'): Promise<{
    subscriptions: any[];
    skippedSubPages: number[];
}> => {
    const subscriptions: any[] = [];
    const skippedSubPages: number[] = [];
    for (let page = 1; page <= 500; page++) {
        let result: {
            data: any[];
            pagination: PvPagination | null;
        };
        try {
            result = await apiRequestWithPagination(c, {
                tokenType: PeopleVineTokenType.USER_COMPANY,
                endpoint: '/subscriptions',
                method: 'GET',
                queryParams: { Page_Size: String(SUB_PAGE_SIZE), Page_Number: String(page), ...(statusFilter ? { Status: statusFilter } : {}) },
            });
        }
        catch {
            skippedSubPages.push(page);
            continue;
        }
        subscriptions.push(...result.data);
        if (!result.pagination?.has_next_page)
            break;
    }
    console.log(`[fetchAllPvData] fetched ${subscriptions.length} subscriptions, skipped pages: [${skippedSubPages.join(',')}]`);
    return { subscriptions, skippedSubPages };
};
export const fetchAllMembershipCards = async (c: Context, statusFilter: string | null = 'active'): Promise<{
    cards: any[];
    skippedPages: number[];
}> => {
    const cards: any[] = [];
    const skippedPages: number[] = [];
    for (let page = 1; page <= 500; page++) {
        let result: {
            data: any[];
            pagination: PvPagination | null;
        };
        try {
            result = await apiRequestWithPagination(c, {
                tokenType: PeopleVineTokenType.USER_COMPANY,
                endpoint: '/memberships/members',
                method: 'GET',
                queryParams: { Page_Size: String(SUB_PAGE_SIZE), Page_Number: String(page), ...(statusFilter ? { Status: statusFilter } : {}) },
            });
        }
        catch {
            skippedPages.push(page);
            continue;
        }
        for (const card of result.data) {
            cards.push({
                id: card.id,
                customer_id: card.customer_id,
                title: card.title,
                parent_card_id: card.parent_card_id,
                primary: card.primary ?? false,
                type: card.type,
                customer_company_name: card.customer?.company_name ?? null,
            });
        }
        if (!result.pagination?.has_next_page)
            break;
    }
    console.log(`[fetchAllMembershipCards] fetched ${cards.length} cards, skipped pages: [${skippedPages.join(',')}]`);
    return { cards, skippedPages };
};
