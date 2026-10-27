import z from "zod";
import { SuccessResponseSchema } from "./response";

const isoDate = z.coerce.date().nullable().transform((d) => (d ? d.toISOString() : null));

export const OffboardingMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  memberSource: z.string(),
});

export const OffboardingRecordSchema = z.object({
  id: z.string(),
  type: z.enum(["company", "user"]),
  companyId: z.string().nullable(),
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  peopleVineId: z.string().nullable(),
  via: z.enum(["admin", "member"]),
  members: z.array(OffboardingMemberSchema),
  accessRemovedAt: isoDate,
  pvRemovedAt: isoDate,
  completedAt: isoDate,
  completedByName: z.string().nullable(),
  createdAt: z.coerce.date().transform((d) => d.toISOString()),
});

export const GetOffboardingsResponseSchema = SuccessResponseSchema(
  z.object({ inProcess: z.array(OffboardingRecordSchema), completed: z.array(OffboardingRecordSchema) })
);

export const OffboardingRecordResponseSchema = SuccessResponseSchema(z.object({ record: OffboardingRecordSchema }));

export const GetCompanyOffboardingMembersResponseSchema = SuccessResponseSchema(
  z.object({ members: z.array(OffboardingMemberSchema) })
);

export const OffboardCompanyRequestSchema = z.object({
  userIds: z.array(z.string().min(1)).max(1000),
});
