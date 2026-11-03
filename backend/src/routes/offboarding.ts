import { Hono } from "hono";
import { AppType } from "@/index";
import { describeRoute } from "@/utils/describeRoute";
import {
  GetCompanyOffboardingMembersResponseSchema,
  GetOffboardingsResponseSchema,
  OffboardCompanyRequestSchema,
  OffboardingRecordResponseSchema,
} from "@common/schemas/offboarding";
import { validate } from "@/middleware/validate";
import { roleMiddleware } from "@/middleware/role";
import { Role } from "@/database/models";
import {
  handleCompleteOffboarding,
  handleGetCompanyOffboardingMembers,
  handleGetOffboardings,
  handleMarkExternalAccountsRemoved,
  handleOffboardCompany,
  handleOffboardUser,
  handleRemoveOffboardingAccess,
} from "@/controllers/offboardingController";

const app = new Hono<AppType>();

const idParam = { name: "id", in: "path" as const, required: true, schema: { type: "string" as const } };

app.get(
  "/",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "List in-process and completed offboardings",
    successMessage: "Success",
    responseSchema: GetOffboardingsResponseSchema,
  }),
  handleGetOffboardings
);

app.get(
  "/company/:id/members",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "List the company's members that can be offboarded with it",
    successMessage: "Success",
    responseSchema: GetCompanyOffboardingMembersResponseSchema,
    parameters: [idParam],
  }),
  handleGetCompanyOffboardingMembers
);

app.post(
  "/user/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Offboard a member: remove all SSO access and add them to the Offboarding tracker",
    successMessage: "Member offboarded",
    responseSchema: OffboardingRecordResponseSchema,
    parameters: [idParam],
  }),
  handleOffboardUser
);

app.post(
  "/company/:id",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Offboard a company and the selected members: remove their SSO access and add one company record to the tracker",
    successMessage: "Company offboarded",
    responseSchema: OffboardingRecordResponseSchema,
    parameters: [idParam],
  }),
  validate(OffboardCompanyRequestSchema),
  handleOffboardCompany
);

app.post(
  "/:id/remove-access",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Remove SSO access for an offboarding record that was started by a member cancellation",
    successMessage: "SSO access removed",
    responseSchema: OffboardingRecordResponseSchema,
    parameters: [idParam],
  }),
  handleRemoveOffboardingAccess
);

app.post(
  "/:id/external-removed",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Mark the member's LearnWorlds, Shop site and DigiFabster accounts as removed",
    successMessage: "External accounts marked as removed",
    responseSchema: OffboardingRecordResponseSchema,
    parameters: [idParam],
  }),
  handleMarkExternalAccountsRemoved
);

app.post(
  "/:id/complete",
  roleMiddleware([Role.ADMIN]),
  describeRoute({
    summary: "Confirm an offboarding and move it to Completed",
    successMessage: "Offboarding completed",
    responseSchema: OffboardingRecordResponseSchema,
    parameters: [idParam],
  }),
  handleCompleteOffboarding
);

export default app;
