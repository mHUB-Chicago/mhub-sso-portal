import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import {
  GetOnboardingLinkResponseSchema,
  SubmitOnboardingLinkRequestSchema,
  SubmitOnboardingLinkResponseSchema,
} from "@common/schemas/onboarding";
import { validate } from "@/middleware/validate";
import { handleGetOnboardingLink, handleSubmitOnboardingLink } from "@/controllers/publicOnboardingController";

const app = new Hono<AppType>();

app.get(
  "/links/:token",
  describeRoute({
    summary: "Get public onboarding link details (unauthenticated)",
    successMessage: "Success",
    responseSchema: GetOnboardingLinkResponseSchema,
    parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleGetOnboardingLink
);

app.post(
  "/links/:token/submit",
  describeRoute({
    summary: "Submit a public onboarding form (unauthenticated)",
    successMessage: "Submission received",
    responseSchema: SubmitOnboardingLinkResponseSchema,
    parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
  }),
  validate(SubmitOnboardingLinkRequestSchema),
  handleSubmitOnboardingLink
);

export default app;
