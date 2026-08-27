import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import {
  ApproveOnboardingSubmissionResponseSchema,
  CompleteOnboardingSubmissionResponseSchema,
  CreateOnboardingLinkRequestSchema,
  CreateOnboardingLinkResponseSchema,
  CreateOnboardingSubmissionRequestSchema,
  CreateOnboardingSubmissionResponseSchema,
  DisapproveOnboardingSubmissionRequestSchema,
  DisapproveOnboardingSubmissionResponseSchema,
  FlagOnboardingSubmissionRequestSchema,
  FlagOnboardingSubmissionResponseSchema,
  GetOnboardingAttributeOptionsResponseSchema,
  GetOnboardingMembershipPackagesResponseSchema,
  GetOnboardingSubmissionResponseSchema,
  GetOnboardingSubmissionsQuerySchema,
  GetOnboardingSubmissionsResponseSchema,
  ReactivateOnboardingSubmissionResponseSchema,
  SendOnboardingLinkEmailRequestSchema,
  SendOnboardingLinkEmailResponseSchema,
  TreatOnboardingSubmissionAsNewResponseSchema,
  UpdateOnboardingSubmissionRequestSchema,
  UpdateOnboardingSubmissionResponseSchema,
} from "@common/schemas/onboarding";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role } from "@/database/models";
import {
  handleApproveOnboardingSubmission,
  handleCompleteOnboardingSubmission,
  handleCreateOnboardingLink,
  handleCreateOnboardingSubmission,
  handleDisapproveOnboardingSubmission,
  handleFlagOnboardingSubmission,
  handleGetOnboardingAttributeOptions,
  handleGetOnboardingMembershipPackages,
  handleGetOnboardingSubmissionById,
  handleGetOnboardingSubmissions,
  handleReactivateOnboardingSubmission,
  handleSendOnboardingLinkEmail,
  handleTreatOnboardingSubmissionAsNew,
  handleUpdateOnboardingSubmission,
} from "@/controllers/onboardingController";

const app = new Hono<AppType>();

app.post(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Record an onboarding submission",
    successMessage: "Onboarding submission recorded",
    responseSchema: CreateOnboardingSubmissionResponseSchema,
  }),
  validate(CreateOnboardingSubmissionRequestSchema),
  handleCreateOnboardingSubmission
);

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "List onboarding submissions",
    successMessage: "Onboarding submissions retrieved successfully",
    responseSchema: GetOnboardingSubmissionsResponseSchema,
    parameters: [{ name: "status", in: "query", required: false, schema: { type: "string" } }],
  }),
  validate(GetOnboardingSubmissionsQuerySchema, "query"),
  handleGetOnboardingSubmissions
);

app.post(
  "/links",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Generate a shareable public onboarding link",
    successMessage: "Onboarding link created",
    responseSchema: CreateOnboardingLinkResponseSchema,
  }),
  validate(CreateOnboardingLinkRequestSchema),
  handleCreateOnboardingLink
);

app.post(
  "/links/:token/send",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Send an onboarding link to a recipient by email",
    successMessage: "Email sent",
    responseSchema: SendOnboardingLinkEmailResponseSchema,
    parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
  }),
  validate(SendOnboardingLinkEmailRequestSchema),
  handleSendOnboardingLinkEmail
);

app.get(
  "/membership-packages",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "List PeopleVine products available as membership packages",
    successMessage: "Success",
    responseSchema: GetOnboardingMembershipPackagesResponseSchema,
  }),
  handleGetOnboardingMembershipPackages
);

app.get(
  "/attribute-options",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "List PeopleVine's fixed-choice attribute options (schools, degrees, pronouns, etc.)",
    successMessage: "Success",
    responseSchema: GetOnboardingAttributeOptionsResponseSchema,
  }),
  handleGetOnboardingAttributeOptions
);

app.get(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Get onboarding submission by ID",
    successMessage: "Onboarding submission retrieved successfully",
    responseSchema: GetOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleGetOnboardingSubmissionById
);

app.patch(
  "/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Update a Pending Review or Needs Attention submission's form data",
    successMessage: "Onboarding submission updated",
    responseSchema: UpdateOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  validate(UpdateOnboardingSubmissionRequestSchema),
  handleUpdateOnboardingSubmission
);

app.post(
  "/:id/approve",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Approve a Pending Review submission and push it to PeopleVine",
    successMessage: "Onboarding submission pushed to PeopleVine",
    responseSchema: ApproveOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleApproveOnboardingSubmission
);

app.post(
  "/:id/disapprove",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Disapprove a Pending Review submission",
    successMessage: "Submission disapproved",
    responseSchema: DisapproveOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  validate(DisapproveOnboardingSubmissionRequestSchema),
  handleDisapproveOnboardingSubmission
);

app.post(
  "/:id/complete",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Mark a submission pushed to PeopleVine as onboarding completed",
    successMessage: "Submission marked as onboarding completed",
    responseSchema: CompleteOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleCompleteOnboardingSubmission
);

app.post(
  "/:id/reactivate",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Reactivate the existing company/user matched by a Needs Attention submission",
    successMessage: "Existing record reactivated",
    responseSchema: ReactivateOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleReactivateOnboardingSubmission
);

app.post(
  "/:id/treat-as-new",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Treat a Needs Attention submission as a genuinely new customer",
    successMessage: "Submission moved to Pending Review",
    responseSchema: TreatOnboardingSubmissionAsNewResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  handleTreatOnboardingSubmissionAsNew
);

app.post(
  "/:id/flag",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Flag a Needs Attention submission for manual cleanup",
    successMessage: "Submission flagged for manual cleanup",
    responseSchema: FlagOnboardingSubmissionResponseSchema,
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
  }),
  validate(FlagOnboardingSubmissionRequestSchema),
  handleFlagOnboardingSubmission
);

export default app;
