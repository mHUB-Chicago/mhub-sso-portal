import { AppType } from "..";
import { JobType } from "./queueConsumer";

export default async (event: ScheduledEvent, env: AppType["Bindings"], ctx: ExecutionContext) => {
  // For now, this only runs at midnight
  console.log(`Scheduled job triggered: ${event.cron}`);
  // console.log(`Enqueuing SYNC_PEOPLEVINE_EVERYTHING job`);
  // await env.QUEUE.send({
  //   jobId: `${crypto.randomUUID()}-${Date.now()}`,
  //   jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
  //   payload: {},
  // });
  // console.log('Deleting old login flows/sessions');
  // TODO: Implement deletion of old login flows/sessions
};
