import { Hono } from "hono";
import { AppType } from "..";
import { describeRoute } from "@/utils/describeRoute";
import z from "zod";
import { handlePeopleVineWebhook } from "@/controllers/peopleVineWebhookController";

const app = new Hono<AppType>();

app.post(
  "/peoplevine",
  describeRoute({
    summary: "Handle PeopleVine webhook",
    successMessage: "PeopleVine webhook received",
    responseSchema: z.any(),
  }),
  handlePeopleVineWebhook
);

export default app;