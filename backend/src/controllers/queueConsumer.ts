import { syncAll as syncAllPeopleVine, syncOne as syncOnePeopleVine } from "@/services/peopleVineService";
import { createMockContext } from "@/utils/createMockContext";


export interface Message {
  jobId: string;
  jobType: JobType;
  payload: any;
}

export const enum JobType {
  SYNC_PEOPLEVINE_EVERYTHING = "SYNC_PEOPLEVINE_EVERYTHING",
  SYNC_PEOPLEVINE_CUSTOMER = "SYNC_PEOPLEVINE_CUSTOMER",
}

export default async (batch: MessageBatch<Message>, env: any, ctx: ExecutionContext) => {
  const context = createMockContext(env, ctx);
  await Promise.all(
    batch.messages.map(async (msg) => {
      const { jobId, jobType, payload } = msg.body;
      console.log(`Processing job ${jobId} of type ${jobType}`);
      console.log("Payload:", payload);

      if (jobType === JobType.SYNC_PEOPLEVINE_EVERYTHING) {
        await syncAllPeopleVine(context);
      } else if (jobType === JobType.SYNC_PEOPLEVINE_CUSTOMER) {
        await syncOnePeopleVine(context, payload.peopleVineId);
      } else {
        console.log(`Unknown job type: ${jobType}`);
      }
      await msg.ack();
    })
  );
};
