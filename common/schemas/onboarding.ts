import { z } from "zod";
import { SuccessResponseSchema } from "./response";

export const OnboardingAddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  country: z.string(),
});

export const OnboardingCompanySchema = z.object({
  name: z.string(),
  website: z.string(),
  size: z.string(),
  founded: z.string(),
  industry: z.string(),
  incorporation: z.string(),
  fundingStage: z.string(),
  problem: z.string(),
  targetMarket: z.string(),
});

export const OnboardingUserSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  title: z.string(),
  email: z.string(),
  birthday: z.string(),
  phoneCountryCode: z.string(),
  phone: z.string(),
  linkedin: z.string(),
  bio: z.string(),
  gender: z.string(),
  pronouns: z.string(),
  ethnicity: z.string(),
  address: OnboardingAddressSchema,
});

export const OnboardingSkillsSchema = z.object({
  undergradSchool: z.string(),
  undergradDegree: z.string(),
  gradSchool: z.string(),
  gradDegree: z.string(),
  industryExperience: z.string(),
  skills: z.array(z.string()),
  shopSkills: z.array(z.string()),
});

export const OnboardingBillingSchema = z.object({
  paymentType: z.enum(["card", "bank"]),
  nameOnCard: z.string(),
  cardLast4: z.string().max(4).optional(),
  expiration: z.string(),
  address: OnboardingAddressSchema,
});

export const OnboardingFormDataSchema = z.object({
  mode: z.enum(["admin", "link"]),
  company: OnboardingCompanySchema,
  user: OnboardingUserSchema,
  membershipPackage: z.string(),
  skills: OnboardingSkillsSchema,
  billing: OnboardingBillingSchema,
});

export type OnboardingFormData = z.infer<typeof OnboardingFormDataSchema>;

export const CreateOnboardingSubmissionRequestSchema = z.object({
  formData: OnboardingFormDataSchema,
});

export const OnboardingSubmissionSchema = z.object({
  id: z.string(),
  mode: z.string(),
  status: z.string(),
  formData: OnboardingFormDataSchema,
  submittedBy: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.coerce.date().transform((d) => d.toISOString()).nullable(),
  reviewNote: z.string().nullable(),
  duplicateMatchType: z.string().nullable(),
  matchedCompanyId: z.string().nullable(),
  matchedUserId: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  pvCustomerId: z.string().nullable(),
  pvMembershipCardId: z.string().nullable(),
  createdAt: z.coerce.date().transform((d) => d.toISOString()),
  updatedAt: z.coerce.date().transform((d) => d.toISOString()),
});

export const CreateOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const GetOnboardingSubmissionsQuerySchema = z.object({
  status: z.string().optional(),
});

export const GetOnboardingSubmissionsResponseSchema = SuccessResponseSchema(
  z.object({ submissions: z.array(OnboardingSubmissionSchema) })
);

export const GetOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const ApproveOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const ReactivateOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const TreatOnboardingSubmissionAsNewResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const FlagOnboardingSubmissionRequestSchema = z.object({
  resolutionNote: z.string().optional(),
});

export const FlagOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

export const OnboardingMembershipPackageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const GetOnboardingMembershipPackagesResponseSchema = SuccessResponseSchema(
  z.object({ packages: z.array(OnboardingMembershipPackageSchema) })
);
