import { AppType } from "..";

// America/Chicago is UTC-5 (CDT) or UTC-6 (CST) depending on daylight saving.
// Two crons are registered (05:00 UTC and 06:00 UTC) to cover both — only the
// one matching the current Chicago offset (i.e. local midnight) proceeds.
const isChicagoMidnightCron = (cron: string, now: Date): boolean => {
  const offsetPart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const isCDT = offsetPart === 'GMT-5';
  return cron === (isCDT ? '0 5 * * *' : '0 6 * * *');
};

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  console.log(`Scheduled job triggered: ${event.cron}`);
  if (!isChicagoMidnightCron(event.cron, new Date(event.scheduledTime))) {
    console.log(`Skipping ${event.cron} — does not match current Chicago midnight offset`);
    return;
  }
  console.log(`Triggering PeopleVine sync via HTTP`);
  ctx.waitUntil(
    fetch(`${env.BACKEND_URL}/__internal/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SEED_TOKEN}`,
      },
    })
      .then(res => res.json())
      .then((data: any) => console.log('Sync result:', data))
      .catch((err: any) => console.error('Scheduled sync failed:', err))
  );
};
