import { Context } from "hono";
import { JobType } from "./queueConsumer";

// Webhook Body: {"customer_no": {@customer_no@}}

export const handlePeopleVineWebhook = async (c: Context) => {
  const payload = await c.req.json();
  const peopleVineId = Number(payload.customer_no);
  if (!Number.isInteger(peopleVineId) || peopleVineId <= 0) {
    console.warn("Received invalid customer_no in PeopleVine webhook:", payload.customer_no);
    return c.json({ message: "Invalid payload" }, 400);
  }
  console.log("Received PeopleVine webhook for customer:", peopleVineId);
  await c.env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_CUSTOMER,
    payload: {
      peopleVineId,
    },
  });
  return c.json({ message: "PeopleVine webhook received" }, 200);
}