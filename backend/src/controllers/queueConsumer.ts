import {
  syncPhaseCompanies,
  syncPhaseUsers,
  syncPhaseDeactivate,
  syncOne as syncOnePeopleVine,
} from "@/services/peopleVineService";
import { createMockContext } from "@/utils/createMockContext";

export interface Message {
  jobId: string;
  jobType: JobType;
  payload: any;
}

export const enum JobType {
  SYNC_PEOPLEVINE_EVERYTHING = "SYNC_PEOPLEVINE_EVERYTHING",
  SYNC_PEOPLEVINE_CUSTOMER = "SYNC_PEOPLEVINE_CUSTOMER",
  SYNC_PHASE_USERS = "SYNC_PHASE_USERS",
  SYNC_PHASE_DEACTIVATE = "SYNC_PHASE_DEACTIVATE",
}

export default async (batch: MessageBatch<Message>, env: any, ctx: ExecutionContext) => {
  const context = createMockContext(env, ctx);
  await Promise.all(
    batch.messages.map(async (msg) => {
      const { jobId, jobType, payload } = msg.body;
      console.log(`Processing job ${jobId} of type ${jobType}`);

      try {
        if (jobType === JobType.SYNC_PEOPLEVINE_EVERYTHING) {
          const { sessionId, type } = payload ?? {};
          if (type === 'CONTINUE') {
            // Sync continue: skip companies, go straight to users from last checkpoint
            const lastSession = await (context.get('db') as any).syncSession.findFirst({
              where: { type: 'ALL', status: { in: ['failed', 'completed'] } },
              orderBy: { startedAt: 'desc' },
            }).catch(() => null);
            const meta = lastSession ? JSON.parse(lastSession.metadata ?? '{}') : {};
            const resumePage = typeof meta.lastCustomerPage === 'number' ? meta.lastCustomerPage + 1 : 1;
            const { hadErrors, hasMore, lastPage } = await syncPhaseUsers(context, sessionId, resumePage);
            if (hasMore) {
              await env.QUEUE.send({
                jobId: crypto.randomUUID(),
                jobType: JobType.SYNC_PHASE_USERS,
                payload: { sessionId, startPage: lastPage + 1 },
              });
            } else {
              await env.QUEUE.send({
                jobId: crypto.randomUUID(),
                jobType: JobType.SYNC_PHASE_DEACTIVATE,
                payload: { sessionId },
              });
            }
          } else {
            // Full sync phase 1: companies
            await syncPhaseCompanies(context, sessionId);
            // Enqueue phase 2: users (separate invocation = fresh subrequest budget)
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_USERS,
              payload: { sessionId },
            });
          }

        } else if (jobType === JobType.SYNC_PHASE_USERS) {
          const { sessionId, startPage = 1 } = payload ?? {};
          const { hadErrors, hasMore, lastPage } = await syncPhaseUsers(context, sessionId, startPage);
          if (hasMore) {
            // More pages — enqueue next batch with fresh subrequest budget
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_USERS,
              payload: { sessionId, startPage: lastPage + 1 },
            });
          } else {
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_DEACTIVATE,
              payload: { sessionId },
            });
          }

        } else if (jobType === JobType.SYNC_PHASE_DEACTIVATE) {
          const { sessionId } = payload ?? {};
          await syncPhaseDeactivate(context, sessionId);

        } else if (jobType === JobType.SYNC_PEOPLEVINE_CUSTOMER) {
          await syncOnePeopleVine(context, payload.peopleVineId);

        } else {
          console.log(`Unknown job type: ${jobType}`);
        }

        await msg.ack();
      } catch (err) {
        console.error(`Job ${jobId} (${jobType}) failed, will retry:`, err);
        await msg.retry();
      }
    })
  );
};
