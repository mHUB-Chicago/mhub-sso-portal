import { Hono } from "hono";
import { AppType } from "@/index";
import { validate } from "@/middleware/validate";
import { describeRoute } from "@/utils/describeRoute";
import { SignMembershipAgreementRequestSchema, SignMembershipAgreementResponseSchema } from "@common/schemas/membershipAgreement";
import { handleSignMembershipAgreement } from "@/controllers/membershipAgreementController";

const app = new Hono<AppType>();

app.post(
  "/sign",
  describeRoute({
    summary: "Sign the mHUB Membership Agreement",
    successMessage: "Membership agreement signed",
    responseSchema: SignMembershipAgreementResponseSchema,
  }),
  validate(SignMembershipAgreementRequestSchema),
  handleSignMembershipAgreement
);

export default app;
