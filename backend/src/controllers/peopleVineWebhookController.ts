import { Context } from "hono";
import { JobType } from "./queueConsumer";

// Webhook Body: {"customer_no": {@customer_no@}}

export const handlePeopleVineWebhook = async (c: Context) => {
  const payload = await c.req.json();
  const peopleVineId = payload.customer_no;
  console.log("Received PeopleVine webhook:", payload);
  await c.env.QUEUE.send({
    jobId: `${crypto.randomUUID()}-${Date.now()}`,
    jobType: JobType.SYNC_PEOPLEVINE_CUSTOMER,
    payload: {
      peopleVineId,
    },
  });
  return c.json({ message: "PeopleVine webhook received" }, 200);
}