import { createMockContext } from "@/utils/createMockContext";

export default async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
  const context = createMockContext(env, ctx);

  console.log(`Cron job triggered: ${event.cron}`);
};
