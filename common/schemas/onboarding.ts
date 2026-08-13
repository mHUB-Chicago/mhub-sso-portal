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
  name: z.string().optional(),
  website: z.string().optional(),
  size: z.string().optional(),
  founded: z.string().optional(),
  industry: z.string().optional(),
  incorporation: z.string().optional(),
  fundingStage: z.string().optional(),
  problem: z.string().optional(),
  targetMarket: z.string().optional(),
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

export const OnboardingFormDataSchema = z
  .object({
    mode: z.enum(["admin", "link"]),
    // Defaulted for backward compatibility: submissions created before this field existed
    // have no `scenario` in their stored formData blob and were all effectively the
    // new-company flow, so that's the safe default when it's missing.
    scenario: z.enum(["new_company", "existing_company"]).default("new_company"),
    companyId: z.string().optional(),
    company: OnboardingCompanySchema,
    user: OnboardingUserSchema,
    membershipPackage: z.string(),
    skills: OnboardingSkillsSchema,
    billing: OnboardingBillingSchema,
  })
  .superRefine((data, ctx) => {
    if (data.scenario === "new_company") {
      if (!data.company.name) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["company", "name"], message: "Company name is required" });
      }
    } else if (data.scenario === "existing_company") {
      if (!data.companyId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyId"], message: "companyId is required for existing_company" });
      }
    }
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

export const UpdateOnboardingSubmissionRequestSchema = z.object({
  formData: OnboardingFormDataSchema,
});

export const UpdateOnboardingSubmissionResponseSchema = SuccessResponseSchema(
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

export const CreateOnboardingLinkRequestSchema = z.object({
  scenario: z.enum(["new_company", "existing_company"]),
});

export const CreateOnboardingLinkResponseSchema = SuccessResponseSchema(
  z.object({ url: z.string(), token: z.string() })
);

export const OnboardingLinkCompanyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const GetOnboardingLinkResponseSchema = SuccessResponseSchema(
  z.object({
    scenario: z.enum(["new_company", "existing_company"]),
    packages: z.array(OnboardingMembershipPackageSchema),
    companies: z.array(OnboardingLinkCompanyOptionSchema).optional(),
  })
);

export const SubmitOnboardingLinkRequestSchema = z.object({
  formData: OnboardingFormDataSchema,
});

export const SubmitOnboardingLinkResponseSchema = SuccessResponseSchema(z.object({}));
