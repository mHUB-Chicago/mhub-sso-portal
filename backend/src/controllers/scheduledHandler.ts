import { JobType } from "./queueConsumer";

export default async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
  env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_EVERYTHING,
    payload: {},
  });
};
