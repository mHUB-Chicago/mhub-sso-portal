import { AppType } from "..";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { JobType } from "./queueConsumer";

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

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  console.log(`Scheduled job triggered: ${event.cron}`);
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
