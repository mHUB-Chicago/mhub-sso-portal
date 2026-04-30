import { AppType } from "..";

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  console.log(`Scheduled job triggered: ${event.cron}`);
  console.log(`Triggering PeopleVine sync via HTTP`);
  ctx.waitUntil(
    fetch(`${env.BACKEND_URL}/__internal/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SEED_TOKEN}`,
      },
    }).then(res => res.json()).then((data: any) => console.log('Sync result:', data))
  );
};
