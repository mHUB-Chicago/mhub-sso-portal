import { AppType } from "..";
import { JobType } from "./queueConsumer";

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  console.log(`Scheduled job triggered: ${event.cron}`);
  await env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
    payload: {},
  });
};
