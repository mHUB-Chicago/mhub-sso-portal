import {
  syncPhaseCompanies,
  syncPhaseUsers,
  syncPhaseDeactivate,
  syncPhaseCorrectionExport,
  syncPhaseCorrectionCompanies,
  syncPhaseCorrectionUsers,
  cleanupCorrectionExport,
  syncFiltered,
  syncFilteredMembers,
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
  SYNC_PHASE_CORRECTION_EXPORT = "SYNC_PHASE_CORRECTION_EXPORT",
  SYNC_PHASE_CORRECTION_COMPANIES = "SYNC_PHASE_CORRECTION_COMPANIES",
  SYNC_PHASE_CORRECTION_USERS = "SYNC_PHASE_CORRECTION_USERS",
  SYNC_FILTERED = "SYNC_FILTERED",
  SYNC_FILTERED_MEMBERS = "SYNC_FILTERED_MEMBERS",
}

export default async (batch: MessageBatch<Message>, env: any, ctx: ExecutionContext) => {
  const context = createMockContext(env, ctx);
  for (const msg of batch.messages) {
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
          await env.QUEUE.send({
            jobId: crypto.randomUUID(),
            jobType: JobType.SYNC_PHASE_CORRECTION_EXPORT,
            payload: { sessionId, startPage: 1 },
          });

        } else if (jobType === JobType.SYNC_PHASE_CORRECTION_EXPORT) {
          const { sessionId, startPage = 1 } = payload ?? {};
          const { hasMore, lastPage } = await syncPhaseCorrectionExport(context, sessionId, startPage);
          await checkCancelled(context.get('db') as PrismaClient, sessionId);
          if (hasMore) {
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_CORRECTION_EXPORT,
              payload: { sessionId, startPage: lastPage + 1 },
            });
          } else {
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_CORRECTION_COMPANIES,
              payload: { sessionId },
            });
          }

        } else if (jobType === JobType.SYNC_PHASE_CORRECTION_COMPANIES) {
          const { sessionId } = payload ?? {};
          await syncPhaseCorrectionCompanies(context, sessionId);
          await checkCancelled(context.get('db') as PrismaClient, sessionId);
          await env.QUEUE.send({
            jobId: crypto.randomUUID(),
            jobType: JobType.SYNC_PHASE_CORRECTION_USERS,
            payload: { sessionId, startBatch: 0 },
          });

        } else if (jobType === JobType.SYNC_PHASE_CORRECTION_USERS) {
          const { sessionId, startBatch = 0 } = payload ?? {};
          const { hasMore, nextBatch } = await syncPhaseCorrectionUsers(context, sessionId, startBatch);
          if (hasMore) {
            await checkCancelled(context.get('db') as PrismaClient, sessionId);
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_PHASE_CORRECTION_USERS,
              payload: { sessionId, startBatch: nextBatch },
            });
          }

        } else if (jobType === JobType.SYNC_PEOPLEVINE_CUSTOMER) {
          const prisma = context.get('db') as PrismaClient;
          const { peopleVineId, webhookLogId, invalidMembership } = payload;
          const activeBulkSession = await prisma.syncSession.findFirst({
            where: { status: { in: ['running', 'pending'] }, type: { in: ['ALL', 'CONTINUE', 'FILTERED'] } },
          });
          if (activeBulkSession) {
            console.log(`Skipping webhook for customer ${peopleVineId} — bulk sync in progress (${activeBulkSession.type}:${activeBulkSession.id})`);
            if (webhookLogId) {
              await prisma.webhookLog.update({ where: { id: webhookLogId }, data: { status: 'skipped' } }).catch(() => {});
            }
            await msg.ack();
            continue;
          }
          await syncOnePeopleVine(context, peopleVineId, webhookLogId);
          if (webhookLogId) {
            const finalStatus = invalidMembership ? 'processed_invalid_membership' : 'processed';
            await prisma.webhookLog.update({ where: { id: webhookLogId }, data: { status: finalStatus } }).catch(() => {});
          }

        } else if (jobType === JobType.SYNC_FILTERED) {
          const { sessionId } = payload ?? {};
          const prisma = context.get('db') as PrismaClient;
          const session = await prisma.syncSession.findUnique({ where: { id: sessionId } });
          const meta = session?.metadata ? JSON.parse(session.metadata) : {};
          await syncFiltered(context, meta.companies ?? [], meta.members ?? [], sessionId);
          await checkCancelled(context.get('db') as PrismaClient, sessionId);
          await env.QUEUE.send({
            jobId: crypto.randomUUID(),
            jobType: JobType.SYNC_FILTERED_MEMBERS,
            payload: { sessionId, startOffset: 0 },
          });

        } else if (jobType === JobType.SYNC_FILTERED_MEMBERS) {
          const { sessionId, startOffset = 0 } = payload ?? {};
          await checkCancelled(context.get('db') as PrismaClient, sessionId);
          const { hasMore, nextOffset } = await syncFilteredMembers(context, sessionId, startOffset);
          if (hasMore) {
            await checkCancelled(context.get('db') as PrismaClient, sessionId);
            await env.QUEUE.send({
              jobId: crypto.randomUUID(),
              jobType: JobType.SYNC_FILTERED_MEMBERS,
              payload: { sessionId, startOffset: nextOffset },
            });
          }

        } else {
          console.log(`Unknown job type: ${jobType}`);
        }

        await msg.ack();
    } catch (err) {
      if (err instanceof SyncCancelledError) {
        console.log(`Job ${jobId} (${jobType}) cancelled — acknowledging without retry.`);
        // Only clean up export blobs if cancellation happened before
        // phase4-data.json existed (export/companies phases). Once
        // SYNC_PHASE_CORRECTION_USERS has started, phase4-data.json is required
        // by every batch — deleting it here and having a duplicate/redelivered
        // message for an earlier batch read it afterward would silently zero out
        // primaryMembership/addOns for that batch's customers. Cancelled sessions
        // are never resumed, so leaving these blobs behind is harmless.
        const correctionJobTypes: JobType[] = [
          JobType.SYNC_PHASE_CORRECTION_EXPORT,
          JobType.SYNC_PHASE_CORRECTION_COMPANIES,
        ];
        if (correctionJobTypes.includes(jobType)) {
          const { sessionId } = payload ?? {};
          if (sessionId) await cleanupCorrectionExport(context, sessionId).catch(() => {});
        }
        await msg.ack();
        continue;
      }
      const prisma = context.get('db') as PrismaClient;
      if (jobType === JobType.SYNC_PEOPLEVINE_CUSTOMER) {
        const { webhookLogId } = payload;
        if (webhookLogId) {
          await prisma.webhookLog.update({
            where: { id: webhookLogId },
            data: { status: 'failed' },
          }).catch(() => {});
        }
      } else {
        const { sessionId } = payload ?? {};
        if (sessionId) {
          const current = await prisma.syncSession.findUnique({ where: { id: sessionId }, select: { logs: true } }).catch(() => null);
          const logs = current?.logs ? JSON.parse(current.logs) : [];
          logs.push({ time: new Date().toISOString(), level: 'error', message: `Job ${jobType} failed: ${err instanceof Error ? err.message : String(err)}` });
          await prisma.syncSession.update({
            where: { id: sessionId },
            data: { status: 'failed', step: 'Failed', completedAt: new Date(), logs: JSON.stringify(logs) },
          }).catch(() => {});
        }
      }
      console.error(`Job ${jobId} (${jobType}) failed, will retry:`, err);
      await msg.retry();
    }
  }
};
