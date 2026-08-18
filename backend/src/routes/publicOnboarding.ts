import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import {
  GetOnboardingAttributeOptionsResponseSchema,
  GetOnboardingLinkResponseSchema,
  SubmitOnboardingLinkRequestSchema,
  SubmitOnboardingLinkResponseSchema,
} from "@common/schemas/onboarding";
import { validate } from "@/middleware/validate";
import { handleGetOnboardingLink, handleSubmitOnboardingLink } from "@/controllers/publicOnboardingController";
import { handleGetOnboardingAttributeOptions } from "@/controllers/onboardingController";

const app = new Hono<AppType>();

app.get(
  "/attribute-options",
  describeRoute({
    summary: "List PeopleVine's fixed-choice attribute options (unauthenticated)",
    successMessage: "Success",
    responseSchema: GetOnboardingAttributeOptionsResponseSchema,
  }),
  handleGetOnboardingAttributeOptions
);

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
