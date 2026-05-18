import { Context } from "hono";
import { JobType } from "./queueConsumer";
import { PrismaClient } from "@prisma/client";

// Webhook Body: {"customer_no": {@customer_no@}}

export const handlePeopleVineWebhook = async (c: Context) => {
  const expectedSecret = c.env.WEBHOOK_SECRET as string | undefined;
  if (expectedSecret) {
    const provided = c.req.query('secret') || c.req.header('x-webhook-secret');
    if (provided !== expectedSecret) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
  }

  const rawBody = await c.req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }

  const prisma = c.get("db") as PrismaClient;
  const logId = crypto.randomUUID();
  const eventType = typeof payload.event_type === 'string' ? payload.event_type
    : typeof payload.type === 'string' ? payload.type
    : 'customer_update';

  const peopleVineId = Number(payload.customer_no);
  if (!Number.isInteger(peopleVineId) || peopleVineId <= 0) {
    console.warn("Received invalid customer_no in PeopleVine webhook:", payload.customer_no);
    c.executionCtx.waitUntil(
      prisma.webhookLog.create({
        data: { id: logId, customerNo: null, eventType, payload: rawBody, status: "invalid" },
      })
    );
    return c.json({ message: "Invalid payload" }, 400);
  }

  c.executionCtx.waitUntil(
    prisma.webhookLog.create({
      data: { id: logId, customerNo: peopleVineId, eventType, payload: rawBody, status: "queued" },
    })
  );

  console.log("Received PeopleVine webhook for customer:", peopleVineId);
  await c.env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_CUSTOMER,
    payload: { peopleVineId, webhookLogId: logId },
  });
  return c.json({ message: "PeopleVine webhook received" }, 200);
}