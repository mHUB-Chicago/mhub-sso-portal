import { AppType } from "..";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient, Role } from "@prisma/client";
import { JobType } from "./queueConsumer";
import { createMockContext } from "@/utils/createMockContext";
import { runConcurrent, syncOne } from "@/services/peopleVineService";

// America/Chicago is UTC-5 (CDT) or UTC-6 (CST) depending on daylight saving.
// Two crons are registered (06:00 UTC and 07:00 UTC) to cover both — only the
// one matching the current Chicago offset (i.e. local 1am) proceeds.
const isChicago1amCron = (cron: string, now: Date): boolean => {
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const isCDT = offsetPart === 'GMT-5';
  return cron === (isCDT ? '0 6 * * *' : '0 7 * * *');
};

const DIRECT_PERSONAL_RECHECK_CRON = '*/30 * * * *';

// "Direct Personal Subscription" (a paying member whose company record is still their own
// personal placeholder) can only get resolved once *some* PeopleVine webhook fires for that
// customer — and PV has no dedicated event for "a card got linked to a sponsor's parent card",
// so that reclassification could otherwise sit stale indefinitely. This is a small, self-pruning
// list (each fixed member drops out of it), so re-checking it directly every 30 minutes is far
// cheaper than waiting for the once-daily full "Sync All" to catch it.
const recheckDirectPersonalSubscriptions = async (env: AppType["Bindings"], ctx: ExecutionContext): Promise<void> => {
  const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
  const flagged = await prisma.user.findMany({
    where: { role: Role.USER, memberSource: 'subscription', company: { isPersonal: true } },
    select: { peopleVineId: true },
  });
  const pvIds = flagged.map(u => u.peopleVineId).filter((id): id is string => !!id);
  if (pvIds.length === 0) {
    console.log('[recheck] No Direct Personal Subscription users to re-check.');
    return;
  }
  console.log(`[recheck] Re-checking ${pvIds.length} Direct Personal Subscription user(s).`);
  const context = createMockContext(env, ctx);
  await runConcurrent(pvIds, 5, async (pvId) => {
    try {
      await syncOne(context, Number(pvId));
    }
    catch (err) {
      console.error(`[recheck] Failed to re-sync customer ${pvId}:`, err);
    }
  });
};

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  console.log(`Scheduled job triggered: ${event.cron}`);

  if (event.cron === DIRECT_PERSONAL_RECHECK_CRON) {
    ctx.waitUntil(recheckDirectPersonalSubscriptions(env, ctx));
    return;
  }

  if (!isChicago1amCron(event.cron, new Date(event.scheduledTime))) {
    console.log(`Skipping ${event.cron} — does not match current Chicago 1am offset`);
    return;
  }
  console.log(`Queuing PeopleVine sync directly`);
  ctx.waitUntil(
    (async () => {
      try {
        const prisma = new PrismaClient({ adapter: new PrismaD1(env.DB) });
        const session = await prisma.syncSession.create({
          data: {
            type: 'ALL',
            status: 'pending',
            step: 'Queued',
            logs: JSON.stringify([{ time: new Date().toISOString(), level: 'info', message: 'Scheduled sync queued' }]),
            metadata: JSON.stringify({ includeFreeMembers: true }),
          },
        });
        await env.QUEUE.send({
          jobId: crypto.randomUUID(),
          jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
          payload: { type: 'ALL', sessionId: session.id },
        });
        console.log(`Scheduled sync queued, session: ${session.id}`);
      }
      catch (err) {
        console.error('Scheduled sync failed:', err);
      }
    })()
  );
};
