import { createMockContext } from "@/utils/createMockContext";

export default async (batch: MessageBatch<{ jobId: string; payload: unknown }>, env: any, ctx: ExecutionContext) => {
  const context = createMockContext(env, ctx);
  await Promise.all(
    batch.messages.map(async (msg) => {
      await msg.ack();
    })
  );
};
