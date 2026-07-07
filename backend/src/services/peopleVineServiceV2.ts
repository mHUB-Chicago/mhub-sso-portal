import { Context } from 'hono';
import { Company, PrismaClient, Role } from '@prisma/client';
import {
    fetchAllPvData,
    fetchAllMembershipCards,
    getCustomers,
    getCustomer,
    normalizeCustomers,
    buildMembershipCardData,
    writeChunkedBlob,
    readChunkedBlob,
    parsePvDate,
    runConcurrent,
    checkCancelled,
    isUniqueConstraintError,
    resolvePlaceholderEmails,
    PeopleVineCustomer,
} from './peopleVineService';
import { createCompany, updateCompany, deactivateCompany } from './companyService';
import { createUser, updateUser, deactivateUser } from './userService';

const EXTRACT_CUSTOMER_BATCH_PAGES = 10;
const COMPUTE_BATCH_SIZE = 500;
const LOAD_BATCH_SIZE = 200;

const appendLog = async (prisma: PrismaClient, sessionId: string | undefined, level: 'info' | 'warn' | 'error', message: string): Promise<void> => {
    if (!sessionId) return;
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { logs: true } }).catch(() => null);
    const logs = session?.logs ? JSON.parse(session.logs) : [];
    logs.push({ time: new Date().toISOString(), level, message });
    await prisma.syncSession.update({ where: { id: sessionId }, data: { logs: JSON.stringify(logs) } }).catch(() => { });
};

const setProgress = async (prisma: PrismaClient, sessionId: string | undefined, progress: number, step: string, status?: string): Promise<void> => {
    if (!sessionId) return;
    await prisma.syncSession.update({
        where: { id: sessionId },
        data: { progress, step, ...(status ? { status } : {}) },
    }).catch(() => { });
};

const getMeta = async (prisma: PrismaClient, sessionId: string | undefined): Promise<Record<string, any>> => {
    if (!sessionId) return {};
    const session = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { metadata: true } });
    return session ? JSON.parse(session.metadata ?? '{}') : {};
};

const saveMeta = async (prisma: PrismaClient, sessionId: string | undefined, patch: Record<string, any>): Promise<void> => {
    if (!sessionId) return;
    const existing = await getMeta(prisma, sessionId);
    const meta = { ...existing, ...patch };
    await prisma.syncSession.update({ where: { id: sessionId }, data: { metadata: JSON.stringify(meta) } }).catch(() => { });
};

// ---------------------------------------------------------------------------
// STAGE A — EXTRACT: fetch everything from PeopleVine ONCE (any-status), no DB writes
// ---------------------------------------------------------------------------

export const syncV2ExtractPvData = async (c: Context, sessionId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    await setProgress(prisma, sessionId, 5, 'V2: Extracting subscriptions from PeopleVine', 'running');
    await appendLog(prisma, sessionId, 'info', '[v2] Extracting all-status subscriptions');
    const { subscriptions, skippedSubPages } = await fetchAllPvData(c, null);
    if (skippedSubPages.length > 0) {
        await appendLog(prisma, sessionId, 'warn', `[v2] Subscription extract skipped pages: [${skippedSubPages.join(', ')}]`);
    }
    // Only id/company_name/full_name off `customer` are ever read back out of these blobs (see
    // buildComputeContext/syncV2LoadSubscriptions) — the full nested customer record (email, phone,
    // address, wallet, etc.) was being duplicated across every subscription row and re-parsed on
    // every compute batch, which is what drove the sync process to exhaust the heap.
    const trimmedSubscriptions = subscriptions.map((sub: any) => ({
        ...sub,
        customer: sub.customer ? { id: sub.customer.id, company_name: sub.customer.company_name, full_name: sub.customer.full_name } : sub.customer,
    }));
    const subscriptionChunkKeys = await writeChunkedBlob(prisma, sessionId, 'v2-subscriptions', trimmedSubscriptions);

    await setProgress(prisma, sessionId, 10, 'V2: Extracting membership cards from PeopleVine', 'running');
    await appendLog(prisma, sessionId, 'info', '[v2] Extracting all-status membership cards');
    const { cards, skippedPages: skippedCardPages } = await fetchAllMembershipCards(c, null);
    if (skippedCardPages.length > 0) {
        await appendLog(prisma, sessionId, 'warn', `[v2] Card extract skipped pages: [${skippedCardPages.join(', ')}]`);
    }
    const cardChunkKeys = await writeChunkedBlob(prisma, sessionId, 'v2-cards', cards);

    await saveMeta(prisma, sessionId, {
        v2SubscriptionChunkKeys: subscriptionChunkKeys,
        v2CardChunkKeys: cardChunkKeys,
        v2CustomerChunkKeys: [],
        // Carried through to syncV2Deactivate: deactivation must never run against incomplete data,
        // or it will wrongly deactivate companies/users whose PV records simply failed to fetch this run.
        ...((skippedSubPages.length > 0 || skippedCardPages.length > 0) ? { v2ExtractHadErrors: true } : {}),
    });
    await appendLog(prisma, sessionId, 'info', `[v2] Extracted ${subscriptions.length} subscriptions, ${cards.length} cards`);
};

// Active subscribers are derived from the all-status subscription export (stage A) — the /customers
// list endpoint can, for pagination/API reasons, simply not return a customer who nonetheless has an
// active company-membership-type subscription. V1 catches this by diffing activePVSubscriberIds
// against everyone actually seen and individually re-fetching the gap; without it those members would
// silently never get a User row. This mirrors that check once the customer pagination is complete.
const appendMissedSubscribers = async (c: Context, prisma: PrismaClient, sessionId: string | undefined): Promise<void> => {
    const meta = await getMeta(prisma, sessionId);
    const subscriptionChunkKeys: string[] = meta.v2SubscriptionChunkKeys ?? [];
    const customerChunkKeys: string[] = meta.v2CustomerChunkKeys ?? [];
    if (subscriptionChunkKeys.length === 0) return;
    const [subscriptions, allCustomers, dbCmtTypes] = await Promise.all([
        readChunkedBlob(prisma, sessionId, subscriptionChunkKeys),
        readChunkedBlob(prisma, sessionId, customerChunkKeys) as Promise<PeopleVineCustomer[]>,
        prisma.companyMembershipType.findMany({ select: { name: true } }),
    ]);
    const cmtNames = new Set(dbCmtTypes.map(t => t.name));
    const activeSubscriberIds = new Set<string>();
    for (const sub of subscriptions as any[]) {
        const cid = sub?.customer?.id?.toString();
        const title = sub.title ? String(sub.title).trim() : null;
        const isActive = sub.status == null ? true : String(sub.status).toLowerCase() === 'active';
        if (cid && title && isActive && cmtNames.has(title)) activeSubscriberIds.add(cid);
    }
    const seenIds = new Set(allCustomers.map(cu => cu.id.toString()));
    const missedIds = Array.from(activeSubscriberIds).filter(id => !seenIds.has(id));
    if (missedIds.length === 0) return;
    await appendLog(prisma, sessionId, 'warn', `[v2] Found ${missedIds.length} active subscriber(s) not returned by /customers — fetching individually`);
    const missedCustomers: PeopleVineCustomer[] = [];
    await runConcurrent(missedIds, 10, async (pvId) => {
        const customer = await getCustomer(c, pvId).catch(() => null);
        if (customer) missedCustomers.push(customer);
    });
    if (missedCustomers.length === 0) return;
    const resolvedMissed = await resolvePlaceholderEmails(c, missedCustomers);
    const newKeys = await writeChunkedBlob(prisma, sessionId, 'v2-customers-missed', resolvedMissed);
    await saveMeta(prisma, sessionId, { v2CustomerChunkKeys: [...customerChunkKeys, ...newKeys] });
    await appendLog(prisma, sessionId, 'info', `[v2] Recovered ${missedCustomers.length} missed subscriber(s).`);
};

export const syncV2ExtractCustomers = async (c: Context, sessionId?: string, startPage = 1): Promise<{
    hasMore: boolean;
    lastPage: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    await checkCancelled(prisma, sessionId);
    await setProgress(prisma, sessionId, 15, `V2: Extracting customers (page ${startPage}+)`, 'running');
    const { customers, hadErrors, lastPage, hasMore } = await getCustomers(c, startPage, EXTRACT_CUSTOMER_BATCH_PAGES);
    if (hadErrors) {
        await appendLog(prisma, sessionId, 'warn', `[v2] Customer extract had page errors up to page ${lastPage}`);
        await saveMeta(prisma, sessionId, { v2CustomerHadErrors: true });
    }
    if (customers.length > 0) {
        // The /customers list endpoint sometimes omits an email that the individual /customers/{id}
        // endpoint has, so resolve placeholder (@noemail.mhub) addresses before persisting — same as
        // the v1 sync — to avoid needlessly assigning a fake email that could later collide on update.
        const resolvedCustomers = await resolvePlaceholderEmails(c, customers);
        const newKeys = await writeChunkedBlob(prisma, sessionId, `v2-customers-${String(startPage).padStart(6, '0')}`, resolvedCustomers);
        const meta = await getMeta(prisma, sessionId);
        const existingKeys: string[] = meta.v2CustomerChunkKeys ?? [];
        await saveMeta(prisma, sessionId, { v2CustomerChunkKeys: [...existingKeys, ...newKeys], v2CustomerLastPage: lastPage });
    }
    if (!hasMore) {
        await appendMissedSubscribers(c, prisma, sessionId);
    }
    await appendLog(prisma, sessionId, 'info', `[v2] Extract: customers through page ${lastPage}${hasMore ? ' (continuing)' : ' (done)'}`);
    return { hasMore, lastPage };
};

// ---------------------------------------------------------------------------
// STAGE B — COMPUTE: derive the correct final User/Company shape for every
// customer in one pass, using the full any-status subscription + card picture.
// ---------------------------------------------------------------------------

interface ComputedUser {
    peopleVineId: string;
    name: string;
    email: string;
    username: string | null;
    companyName: string;
    isPersonal: boolean;
    memberSource: 'subscription' | 'membership';
    primaryMembership: string | null;
    primaryMembershipStatus: string | null;
    addOns: string[];
    memberSourceCompany: string;
    active: boolean;
    profilePhoto: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    cardStatus: string | null;
}

const buildComputeContext = async (prisma: PrismaClient, sessionId: string | undefined) => {
    const meta = await getMeta(prisma, sessionId);
    const [subscriptions, cards, dbCompanyTypes, dbPortalTypes, dbPrimaryTypes, dbAddonTypes, dbFreeMemberExclusions] = await Promise.all([
        readChunkedBlob(prisma, sessionId, meta.v2SubscriptionChunkKeys ?? []),
        readChunkedBlob(prisma, sessionId, meta.v2CardChunkKeys ?? []),
        prisma.companyMembershipType.findMany({ select: { name: true } }),
        prisma.companyMembershipType.findMany({ select: { name: true } }),
        prisma.primarySubscriptionType.findMany({ select: { name: true } }),
        prisma.addonSubscriptionType.findMany({ select: { name: true } }),
        prisma.freeMemberExclusionType.findMany({ select: { name: true } }),
    ]);
    const companyMembershipTypeSet = new Set(dbCompanyTypes.map(t => t.name));
    const portalAccessTypeSet = new Set(dbPortalTypes.map(t => t.name));
    const primaryTypeSet = new Set(dbPrimaryTypes.map(t => t.name));
    const addonTypeSet = new Set(dbAddonTypes.map(t => t.name));
    const freeMemberExclusionSet = new Set(dbFreeMemberExclusions.map(t => t.name));

    const subsByCustomerId = new Map<string, any[]>();
    for (const sub of subscriptions) {
        const cid = sub?.customer?.id?.toString();
        if (!cid) continue;
        if (!subsByCustomerId.has(cid)) subsByCustomerId.set(cid, []);
        subsByCustomerId.get(cid)!.push(sub);
    }
    const cardDataByCustomerId = buildMembershipCardData(cards);

    return { subscriptions, cards, subsByCustomerId, cardDataByCustomerId, companyMembershipTypeSet, portalAccessTypeSet, primaryTypeSet, addonTypeSet, freeMemberExclusionSet };
};

type ComputeContext = Awaited<ReturnType<typeof buildComputeContext>>;

// syncV2Compute runs once per customer batch (a separate queue message each time). Without this
// cache, every batch re-read and re-parsed the entire subscriptions+cards dataset from blob storage
// and rebuilt the lookup maps from scratch — O(batches x dataset size) — which is what exhausted the
// heap on large syncs. Single slot keyed by session + chunk-key count is enough: only one compute
// context is ever in flight per session, and a new session naturally evicts the old one.
let cachedComputeContext: { sessionId: string; fingerprint: string; ctx: ComputeContext } | null = null;

const getComputeContext = async (prisma: PrismaClient, sessionId: string | undefined, meta: Record<string, any>): Promise<ComputeContext> => {
    const key = sessionId ?? '';
    const fingerprint = `${(meta.v2SubscriptionChunkKeys ?? []).length}:${(meta.v2CardChunkKeys ?? []).length}`;
    if (cachedComputeContext && cachedComputeContext.sessionId === key && cachedComputeContext.fingerprint === fingerprint) {
        return cachedComputeContext.ctx;
    }
    const ctx = await buildComputeContext(prisma, sessionId);
    cachedComputeContext = { sessionId: key, fingerprint, ctx };
    return ctx;
};

const pickBest = (types: string[], primaryTypeSet: Set<string>, portalAccessTypeSet: Set<string>): string | null =>
    types.find(t => primaryTypeSet.has(t)) ?? types.find(t => portalAccessTypeSet.has(t)) ?? types[0] ?? null;

const computeForCustomer = (
    customer: PeopleVineCustomer,
    ctx: ComputeContext,
    companyIsFreeQualified: (types: string[]) => boolean,
    includeFreeMembers: boolean,
    dbCompaniesByName: Map<string, { active: boolean; membershipTypes: string }>,
): ComputedUser => {
    const pvId = customer.id.toString();
    const custSubs = ctx.subsByCustomerId.get(pvId) ?? [];
    const activeCmtTitles: string[] = [];
    const attemptedCmtTitles: string[] = [];
    const rawActiveTitles: string[] = [];
    for (const sub of custSubs) {
        const title = sub.title ? String(sub.title).trim() : null;
        if (!title) continue;
        const isActive = sub.status == null ? true : String(sub.status).toLowerCase() === 'active';
        if (isActive && !rawActiveTitles.includes(title)) rawActiveTitles.push(title);
        if (ctx.companyMembershipTypeSet.has(title)) {
            if (!attemptedCmtTitles.includes(title)) attemptedCmtTitles.push(title);
            if (isActive && !activeCmtTitles.includes(title)) activeCmtTitles.push(title);
        }
    }
    const isSubscriber = activeCmtTitles.length > 0;
    const attempted = attemptedCmtTitles.length > 0;
    const memberSource: 'subscription' | 'membership' = (isSubscriber || attempted) ? 'subscription' : 'membership';

    const cardData = ctx.cardDataByCustomerId[pvId] ?? { ownTypes: [], primaryCardTitle: null, primaryCardSourceCompanyName: null, allCardTypes: [], secondaryProviders: [] };
    const anyStatusPrimaryCard = ctx.cards.find((card: any) => card.customer_id?.toString() === pvId && card.primary === true && card.id !== undefined);
    const membershipTypesForFallback = activeCmtTitles.length > 0 ? activeCmtTitles : rawActiveTitles;
    const primaryMembership: string | null = cardData.primaryCardTitle
        ?? (anyStatusPrimaryCard ? (anyStatusPrimaryCard.title ?? '').trim() || null : null)
        ?? pickBest(membershipTypesForFallback, ctx.primaryTypeSet, ctx.portalAccessTypeSet);
    const primaryMembershipStatus: string | null = primaryMembership === null
        ? null
        : (cardData.primaryCardTitle !== null ? 'Active' : (anyStatusPrimaryCard ? 'Cancelled' : 'Active'));
    const addOns = Array.from(new Set([
        ...membershipTypesForFallback.filter(t => ctx.addonTypeSet.has(t) && t !== primaryMembership),
        ...cardData.allCardTypes.filter(t => ctx.addonTypeSet.has(t) && t !== primaryMembership),
    ]));

    const isMember = customer.isMember ?? false;
    let active = (customer.pvActive ?? true) && (memberSource === 'subscription' ? true : (includeFreeMembers && isMember && companyIsFreeQualified(cardData.allCardTypes)));

    // A free member who doesn't qualify through their own company can still be active if they hold a
    // secondary membership card sponsored by a different, currently-active/qualifying company (e.g. a
    // parent or partner org) — mirrors v1's correction-pass "external provider" fallback, which was
    // otherwise completely absent from this single-pass compute.
    if (!active && (customer.pvActive ?? true) && includeFreeMembers && isMember) {
        const ownNameLower = customer.company_name.trim().toLowerCase();
        const externalProviders = cardData.secondaryProviders.filter(sp => sp.providingCompanyName && sp.providingCompanyName.trim().toLowerCase() !== ownNameLower);
        for (const sp of externalProviders) {
            const sponsor = dbCompaniesByName.get(sp.providingCompanyName!.trim().toLowerCase());
            if (!sponsor || sponsor.active === false) continue;
            const sponsorTypes = JSON.parse(sponsor.membershipTypes || '[]') as string[];
            const sponsorQualifies = sponsorTypes.some(t => (ctx.portalAccessTypeSet.has(t) || ctx.primaryTypeSet.has(t)) && !ctx.freeMemberExclusionSet.has(t));
            if (sponsorQualifies) { active = true; break; }
        }
    }

    return {
        peopleVineId: pvId,
        name: customer.full_name,
        email: customer.email.toLowerCase(),
        username: customer.username ? customer.username.trim().toLowerCase() : null,
        companyName: customer.company_name,
        isPersonal: customer.isPersonal ?? false,
        memberSource,
        primaryMembership,
        primaryMembershipStatus,
        addOns,
        memberSourceCompany: primaryMembership !== null ? (cardData.primaryCardSourceCompanyName ?? customer.company_name) : customer.company_name,
        active,
        profilePhoto: customer.profilePhoto,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zipCode: customer.zipCode,
        cardStatus: customer.cardStatus,
    };
};

export const syncV2Compute = async (c: Context, sessionId?: string, startBatch = 0): Promise<{
    hasMore: boolean;
    nextBatch: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    await checkCancelled(prisma, sessionId);
    const meta = await getMeta(prisma, sessionId);
    const customerChunkKeys: string[] = meta.v2CustomerChunkKeys ?? [];
    if (startBatch >= customerChunkKeys.length) {
        return { hasMore: false, nextBatch: startBatch };
    }
    await setProgress(prisma, sessionId, 40 + Math.round((startBatch / Math.max(customerChunkKeys.length, 1)) * 20), `V2: Computing (batch ${startBatch + 1}/${customerChunkKeys.length})`, 'running');

    const ctx = await getComputeContext(prisma, sessionId, meta);
    // Mirrors v1: the sync-start UI lets an admin uncheck "include free members" before running a
    // full sync, expecting non-paying members to be excluded from getting a portal account.
    const includeFreeMembers: boolean = meta.includeFreeMembers !== false;
    const dbCompanies = await prisma.company.findMany({ select: { id: true, name: true, membershipTypes: true, active: true } });
    const companyTypesByName = new Map(dbCompanies.map(co => [co.name.trim().toLowerCase(), JSON.parse(co.membershipTypes || '[]') as string[]]));
    const dbCompaniesByName = new Map(dbCompanies.map(co => [co.name.trim().toLowerCase(), { active: co.active, membershipTypes: co.membershipTypes }]));
    const companyIsFreeQualified = (fallbackTypes: string[]) => (types: string[]) =>
        types.some(t => (ctx.portalAccessTypeSet.has(t) || ctx.primaryTypeSet.has(t)) && !ctx.freeMemberExclusionSet.has(t))
        || fallbackTypes.some(t => (ctx.portalAccessTypeSet.has(t) || ctx.primaryTypeSet.has(t)) && !ctx.freeMemberExclusionSet.has(t));

    const rawCustomersInBatch = await readChunkedBlob(prisma, sessionId, [customerChunkKeys[startBatch]]);
    const customers = rawCustomersInBatch as PeopleVineCustomer[];

    const computedUsers: ComputedUser[] = [];
    const computedCompanies = new Map<string, { name: string; peopleVineId: string; email: string; isPersonal: boolean; membershipTypes: string[] }>();

    for (const customer of customers) {
        const pvId = customer.id.toString();
        const custSubs = ctx.subsByCustomerId.get(pvId) ?? [];
        const activeCmtTitles = custSubs
            .filter((sub: any) => (sub.status == null || String(sub.status).toLowerCase() === 'active') && sub.title && ctx.companyMembershipTypeSet.has(String(sub.title).trim()))
            .map((sub: any) => String(sub.title).trim());
        const uniqueActiveCmtTitles = Array.from(new Set(activeCmtTitles));
        const existingCompanyTypes = companyTypesByName.get(customer.company_name.trim().toLowerCase()) ?? [];
        const computed = computeForCustomer(customer, ctx, companyIsFreeQualified(existingCompanyTypes), includeFreeMembers, dbCompaniesByName);
        computedUsers.push(computed);
        // Only propose a company for this customer if they actually qualify for an active user
        // (matches the gate syncV2LoadUsers applies before creating one). Without this, every
        // customer in the full /customers list — including the ~95% who are neither subscribers
        // nor qualifying free members — got their own placeholder "company" row with no user ever
        // attached to it.
        if (computed.active) {
            if (!computedCompanies.has(customer.company_name)) {
                computedCompanies.set(customer.company_name, {
                    name: customer.company_name,
                    peopleVineId: pvId,
                    email: customer.email.toLowerCase(),
                    isPersonal: customer.isPersonal ?? false,
                    membershipTypes: uniqueActiveCmtTitles,
                });
            } else if (uniqueActiveCmtTitles.length > 0) {
                const existing = computedCompanies.get(customer.company_name)!;
                existing.membershipTypes = Array.from(new Set([...existing.membershipTypes, ...uniqueActiveCmtTitles]));
            }
        }
    }

    const userChunkKeys = await writeChunkedBlob(prisma, sessionId, `v2-computed-users-${String(startBatch).padStart(6, '0')}`, computedUsers);
    const companyChunkKeys = await writeChunkedBlob(prisma, sessionId, `v2-computed-companies-${String(startBatch).padStart(6, '0')}`, Array.from(computedCompanies.values()));
    const existingUserKeys: string[] = meta.v2ComputedUserChunkKeys ?? [];
    const existingCompanyKeys: string[] = meta.v2ComputedCompanyChunkKeys ?? [];
    await saveMeta(prisma, sessionId, {
        v2ComputedUserChunkKeys: [...existingUserKeys, ...userChunkKeys],
        v2ComputedCompanyChunkKeys: [...existingCompanyKeys, ...companyChunkKeys],
    });

    const nextBatch = startBatch + 1;
    const hasMore = nextBatch < customerChunkKeys.length;
    if (!hasMore) {
        cachedComputeContext = null;
    }
    await appendLog(prisma, sessionId, 'info', `[v2] Compute batch ${startBatch + 1}/${customerChunkKeys.length} done (${computedUsers.length} customers).`);
    return { hasMore, nextBatch };
};

// ---------------------------------------------------------------------------
// STAGE C — LOAD: the only stage that writes to Company/User tables.
// ---------------------------------------------------------------------------

export const syncV2LoadCompanies = async (c: Context, sessionId?: string, startBatch = 0): Promise<{
    hasMore: boolean;
    nextBatch: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    await checkCancelled(prisma, sessionId);
    const meta = await getMeta(prisma, sessionId);
    const companyChunkKeys: string[] = meta.v2ComputedCompanyChunkKeys ?? [];
    if (startBatch >= companyChunkKeys.length) {
        return { hasMore: false, nextBatch: startBatch };
    }
    await setProgress(prisma, sessionId, 65 + Math.round((startBatch / Math.max(companyChunkKeys.length, 1)) * 10), `V2: Loading companies (batch ${startBatch + 1}/${companyChunkKeys.length})`, 'running');
    const companies = await readChunkedBlob(prisma, sessionId, [companyChunkKeys[startBatch]]) as {
        name: string;
        peopleVineId: string;
        email: string;
        isPersonal: boolean;
        membershipTypes: string[];
    }[];
    const seenPvIds = new Set<string>();
    const dedupedCompanies = companies.filter(co => {
        if (seenPvIds.has(co.peopleVineId)) return false;
        seenPvIds.add(co.peopleVineId);
        return true;
    });
    // A company's peopleVineId here is really "whichever active customer represented it in this
    // batch" — a company with active members spread across several customer batches can show up
    // under a different representative id each time. Matching by name too (in addition to
    // peopleVineId) is what stops that from creating duplicate rows for the same company.
    const findExisting = (co: { name: string; peopleVineId: string }) =>
        prisma.company.findFirst({ where: { OR: [{ peopleVineId: co.peopleVineId }, { name: co.name }] } });
    await runConcurrent(dedupedCompanies, 20, async (co) => {
        const existing = await findExisting(co);
        if (existing) {
            const isPlaceholderEmail = existing.email.endsWith('@noemail.mhub') || existing.email.endsWith('@placeholder.invalid');
            const newEmail = isPlaceholderEmail && co.email ? co.email : undefined;
            try {
                await updateCompany(c, {
                    id: existing.id,
                    name: co.name,
                    active: true,
                    membershipTypes: co.membershipTypes,
                    isPersonal: co.isPersonal,
                    peopleVineId: co.peopleVineId,
                    email: newEmail,
                });
            } catch (e) {
                if (!isUniqueConstraintError(e)) throw e;
                // the real email we tried to backfill is already taken by another record — keep the
                // existing placeholder rather than failing the whole batch.
                await updateCompany(c, {
                    id: existing.id,
                    name: co.name,
                    active: true,
                    membershipTypes: co.membershipTypes,
                    isPersonal: co.isPersonal,
                    peopleVineId: co.peopleVineId,
                });
            }
        } else {
            try {
                await createCompany(c, {
                    name: co.name,
                    peopleVineId: co.peopleVineId,
                    active: true,
                    email: co.email,
                    membershipTypes: co.membershipTypes,
                    isPersonal: co.isPersonal,
                });
            } catch (e) {
                if (!isUniqueConstraintError(e)) throw e;
                const fallback = await findExisting(co);
                if (fallback) {
                    await updateCompany(c, {
                        id: fallback.id,
                        name: co.name,
                        active: true,
                        membershipTypes: co.membershipTypes,
                        isPersonal: co.isPersonal,
                    });
                }
            }
        }
    }, () => checkCancelled(prisma, sessionId));
    const nextBatch = startBatch + 1;
    const hasMore = nextBatch < companyChunkKeys.length;
    await appendLog(prisma, sessionId, 'info', `[v2] Load companies batch ${startBatch + 1}/${companyChunkKeys.length} done.`);
    return { hasMore, nextBatch };
};

export const syncV2LoadUsers = async (c: Context, sessionId?: string, startBatch = 0): Promise<{
    hasMore: boolean;
    nextBatch: number;
}> => {
    const prisma: PrismaClient = c.get('db');
    await checkCancelled(prisma, sessionId);
    const meta = await getMeta(prisma, sessionId);
    const userChunkKeys: string[] = meta.v2ComputedUserChunkKeys ?? [];
    if (startBatch >= userChunkKeys.length) {
        return { hasMore: false, nextBatch: startBatch };
    }
    await setProgress(prisma, sessionId, 75 + Math.round((startBatch / Math.max(userChunkKeys.length, 1)) * 20), `V2: Loading users (batch ${startBatch + 1}/${userChunkKeys.length})`, 'running');
    const users = await readChunkedBlob(prisma, sessionId, [userChunkKeys[startBatch]]) as ComputedUser[];
    await runConcurrent(users, 20, async (u) => {
        const company = await prisma.company.findFirst({ where: { name: u.companyName } });
        if (!company) return;
        const existingByPvId = await prisma.user.findFirst({ where: { peopleVineId: u.peopleVineId } });
        // Only adopt an email match if that account has no peopleVineId yet (e.g. a pre-PV manual
        // account being linked up for the first time). If it's already tied to a *different* PV
        // customer, an email collision must not cause this batch to silently overwrite that person's
        // identity/company with the current customer's data.
        const existingByEmailRaw = existingByPvId ? null : await prisma.user.findFirst({ where: { email: u.email } });
        const existingByEmail = existingByEmailRaw && !existingByEmailRaw.peopleVineId ? existingByEmailRaw : null;
        const existing = existingByPvId ?? existingByEmail;
        if (existing && existing.role === Role.ADMIN) return;
        const addOnsJson = JSON.stringify(u.addOns);
        if (existing) {
            const updateFields = {
                id: existing.id,
                name: u.name,
                companyId: company.id,
                peopleVineId: u.peopleVineId,
                primaryMembership: u.primaryMembership,
                primaryMembershipStatus: u.primaryMembershipStatus,
                addOns: u.addOns,
                profilePhoto: u.profilePhoto,
                active: u.active,
                phone: u.phone,
                address: u.address,
                city: u.city,
                state: u.state,
                zipCode: u.zipCode,
                cardStatus: u.cardStatus,
                memberSource: u.memberSource,
                memberSourceCompany: u.memberSourceCompany,
            };
            try {
                await updateUser(c, { ...updateFields, email: u.email, username: u.username });
            } catch (e) {
                if (!isUniqueConstraintError(e)) throw e;
                // this PV customer's computed email/username now collides with a different existing
                // account (e.g. a placeholder email got replaced by a real one already used elsewhere) —
                // update everything else and leave the conflicting identity fields as they were.
                await updateUser(c, updateFields);
            }
        } else {
            if (!u.active) return;
            try {
                await createUser(c, {
                    name: u.name,
                    email: u.email,
                    username: u.username,
                    peopleVineId: u.peopleVineId,
                    role: Role.USER,
                    companyId: company.id,
                    primaryMembership: u.primaryMembership,
                    primaryMembershipStatus: u.primaryMembershipStatus,
                    addOns: u.addOns,
                    profilePhoto: u.profilePhoto,
                    active: u.active,
                    phone: u.phone,
                    address: u.address,
                    city: u.city,
                    state: u.state,
                    zipCode: u.zipCode,
                    cardStatus: u.cardStatus,
                    memberSource: u.memberSource,
                    memberSourceCompany: u.memberSourceCompany,
                });
            } catch (e) {
                if (!isUniqueConstraintError(e)) throw e;
            }
        }
        void addOnsJson;
    }, () => checkCancelled(prisma, sessionId));
    const nextBatch = startBatch + 1;
    const hasMore = nextBatch < userChunkKeys.length;
    await appendLog(prisma, sessionId, 'info', `[v2] Load users batch ${startBatch + 1}/${userChunkKeys.length} done.`);
    return { hasMore, nextBatch };
};

export const syncV2LoadSubscriptions = async (c: Context, sessionId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    await checkCancelled(prisma, sessionId);
    await setProgress(prisma, sessionId, 96, 'V2: Loading subscriptions', 'running');
    const meta = await getMeta(prisma, sessionId);
    const subscriptions = await readChunkedBlob(prisma, sessionId, meta.v2SubscriptionChunkKeys ?? []);
    const dbCompanies = await prisma.company.findMany({ select: { id: true, name: true } });
    const companiesByName = new Map(dbCompanies.map(co => [co.name.trim().toLowerCase(), co.id]));
    await runConcurrent(subscriptions, 20, async (sub: any) => {
        const pvId = sub.id?.toString();
        if (!pvId) return;
        const customerCompanyName = (sub.customer?.company_name ?? '').trim().toLowerCase();
        const companyId = customerCompanyName ? companiesByName.get(customerCompanyName) ?? null : null;
        const data = {
            pvCustomerId: sub.customer?.id?.toString() ?? '',
            customerName: sub.customer?.full_name ?? null,
            companyId,
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
    }, () => checkCancelled(prisma, sessionId));
    await appendLog(prisma, sessionId, 'info', `[v2] Loaded ${subscriptions.length} subscriptions.`);
};

export const syncV2Deactivate = async (c: Context, sessionId?: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    await setProgress(prisma, sessionId, 98, 'V2: Deactivating removed records', 'running');
    const meta = await getMeta(prisma, sessionId);
    if (meta.v2ExtractHadErrors || meta.v2CustomerHadErrors) {
        // Never deactivate against incomplete data — a page that failed to fetch this run must not
        // read as "this company/user no longer exists in PeopleVine".
        await appendLog(prisma, sessionId, 'warn', '[v2] Skipping deactivation — a previous extract phase had page errors.');
        return;
    }
    const userChunkKeys: string[] = meta.v2ComputedUserChunkKeys ?? [];
    const computedUsers = await readChunkedBlob(prisma, sessionId, userChunkKeys) as ComputedUser[];
    const activePvIds = new Set(computedUsers.filter(u => u.active).map(u => u.peopleVineId));
    const dbUsers = await prisma.user.findMany({ where: { role: Role.USER, peopleVineId: { not: null } } });
    let deactivatedCount = 0;
    await runConcurrent(dbUsers, 20, async (u) => {
        if (u.peopleVineId && !activePvIds.has(u.peopleVineId) && u.active) {
            await deactivateUser(c, u.id);
            deactivatedCount++;
        }
    }, () => checkCancelled(prisma, sessionId));

    const companyChunkKeys: string[] = meta.v2ComputedCompanyChunkKeys ?? [];
    const computedCompanies = await readChunkedBlob(prisma, sessionId, companyChunkKeys) as { name: string }[];
    const activeCompanyNames = new Set(computedCompanies.map(co => co.name));
    const dbCompanies = await prisma.company.findMany();
    let deactivatedCompanyCount = 0;
    await runConcurrent(dbCompanies, 20, async (co: Company) => {
        if (!activeCompanyNames.has(co.name) && co.active) {
            await deactivateCompany(c, co.id);
            deactivatedCompanyCount++;
        }
    }, () => checkCancelled(prisma, sessionId));

    await appendLog(prisma, sessionId, 'info', `[v2] Deactivated ${deactivatedCount} user(s), ${deactivatedCompanyCount} compan(y/ies).`);
};

export const cleanupV2Export = async (c: Context, sessionId: string): Promise<void> => {
    const prisma: PrismaClient = c.get('db');
    await prisma.syncExportBlob.deleteMany({ where: { sessionId, NOT: { key: { startsWith: 'audit-' } } } });
};
