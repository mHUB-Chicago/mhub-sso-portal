import {
  syncPhaseCompanies,
  syncPhaseUsers,
  syncPhaseDeactivate,
  syncFiltered,
  syncOne as syncOnePeopleVine,
  checkCancelled,
  SyncCancelledError,
} from "@/services/peopleVineService";
import { PrismaClient } from "@/database/models";
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
  SYNC_FILTERED = "SYNC_FILTERED",
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
            const lastSession = await (context.get('db') as any).syncSession.findFirst({
              where: { type: 'ALL', status: { in: ['failed', 'completed'] } },
              orderBy: { startedAt: 'desc' },
            }).catch(() => null);
            const meta = lastSession ? JSON.parse(lastSession.metadata ?? '{}') : {};
            const resumePage = typeof meta.lastCustomerPage === 'number' ? meta.lastCustomerPage + 1 : 1;
            const { hadErrors, hasMore, lastPage } = await syncPhaseUsers(context, sessionId, resumePage);
            await checkCancelled(context.get('db') as PrismaClient, sessionId);
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
            await syncPhaseCompanies(context, sessionId);
            await checkCancelled(context.get('db') as PrismaClient, sessionId);
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_USERS,
              payload: { sessionId },
            });
          }

        } else if (jobType === JobType.SYNC_PHASE_USERS) {
          const { sessionId, startPage = 1 } = payload ?? {};
          const { hadErrors, hasMore, lastPage } = await syncPhaseUsers(context, sessionId, startPage);
          await checkCancelled(context.get('db') as PrismaClient, sessionId);
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

        } else if (jobType === JobType.SYNC_PHASE_DEACTIVATE) {
          const { sessionId } = payload ?? {};
          await syncPhaseDeactivate(context, sessionId);

        } else if (jobType === JobType.SYNC_PEOPLEVINE_CUSTOMER) {
          const prisma = context.get('db') as PrismaClient;
          const activeBulkSession = await prisma.syncSession.findFirst({
            where: { status: { in: ['running', 'pending'] }, type: { in: ['ALL', 'CONTINUE', 'FILTERED'] } },
          });
          if (activeBulkSession) {
            console.log(`Skipping webhook for customer ${payload.peopleVineId} — bulk sync in progress (${activeBulkSession.type}:${activeBulkSession.id})`);
            await msg.ack();
            return;
          }
          await syncOnePeopleVine(context, payload.peopleVineId);

        } else if (jobType === JobType.SYNC_FILTERED) {
          const { sessionId } = payload ?? {};
          const prisma = context.get('db') as PrismaClient;
          const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
          const meta = session?.metadata ? JSON.parse(session.metadata) : {};
          await syncFiltered(context, meta.companies ?? [], meta.members ?? [], sessionId);

        } else {
          console.log(`Unknown job type: ${jobType}`);
        }

        await msg.ack();
      } catch (err) {
        if (err instanceof SyncCancelledError) {
          console.log(`Job ${jobId} (${jobType}) cancelled — acknowledging without retry.`);
          await msg.ack();
          return;
        }
        console.error(`Job ${jobId} (${jobType}) failed, will retry:`, err);
        await msg.retry();
      }
    })
  );
};
