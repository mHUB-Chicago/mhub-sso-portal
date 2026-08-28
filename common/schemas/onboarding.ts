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
  // Optional — if left blank, PV falls back to a "+company" alias on the primary
  // user's own email (see buildCompanyPlaceholderEmail, peopleVinePortalService.ts).
  email: z.string().optional(),
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
  // Coerced for backward compatibility: submissions created before ethnicity
  // became a multi-select stored it as a plain string.
  ethnicity: z.preprocess(
    (val) => (typeof val === "string" ? (val ? [val] : []) : val),
    z.array(z.string())
  ),
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
    // existing_company only — the primary membership is inherited from the company, so
    // this is purely optional add-ons the new person might also want. Defaulted for
    // backward compatibility with submissions created before this field existed.
    addonMemberships: z.array(z.string()).default([]),
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
  completedBy: z.string().nullable(),
  completedAt: z.coerce.date().transform((d) => d.toISOString()).nullable(),
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

export const CompleteOnboardingSubmissionResponseSchema = SuccessResponseSchema(
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

export const DisapproveOnboardingSubmissionRequestSchema = z.object({
  resolutionNote: z.string().optional(),
});

export const DisapproveOnboardingSubmissionResponseSchema = SuccessResponseSchema(
  z.object({ submission: OnboardingSubmissionSchema })
);

// Default (in-process) onboarding tab — live Company/User rows with
// accountStatus "pending_membership" (created by the tagged-onboarding sync path, not
// OnboardingSubmission rows). Auto-updates as the sync engine (webhook or batch/full)
// picks up matching PV records; see mHUB_Onboarding_Sync_Implementation_Plan.md.
export const OnboardingInProcessRecordSchema = z.object({
  id: z.string(),
  type: z.enum(["company", "user"]),
  name: z.string(),
  email: z.string(),
  peopleVineId: z.string().nullable(),
  createdAt: z.coerce.date().transform((d) => d.toISOString()),
});

export const GetOnboardingInProcessResponseSchema = SuccessResponseSchema(
  z.object({ records: z.array(OnboardingInProcessRecordSchema) })
);

export const OnboardingMembershipPackageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const GetOnboardingMembershipPackagesResponseSchema = SuccessResponseSchema(
  z.object({ packages: z.array(OnboardingMembershipPackageSchema) })
);

// Add-on memberships (PV Type="add-on") — offered only when adding a person to an
// existing_company, whose primary membership is inherited from the company instead of
// chosen on the form.
export const GetOnboardingAddonPackagesResponseSchema = SuccessResponseSchema(
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
    // existing_company only — omitted (not fetched from PV) for new_company links.
    addonPackages: z.array(OnboardingMembershipPackageSchema).optional(),
    companies: z.array(OnboardingLinkCompanyOptionSchema).optional(),
  })
);

export const SubmitOnboardingLinkRequestSchema = z.object({
  formData: OnboardingFormDataSchema,
});

export const SubmitOnboardingLinkResponseSchema = SuccessResponseSchema(z.object({}));

export const SendOnboardingLinkEmailRequestSchema = z.object({
  to: z.string().email(),
  toName: z.string().optional(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

export const SendOnboardingLinkEmailResponseSchema = SuccessResponseSchema(z.object({}));

// One PV "Attribute" (a custom field configured in the PV Control Panel) that offers a
// fixed set of choices (select/radio/checkbox) — matched by `name` against the exact
// PV-configured attribute name. Fetched live rather than hardcoded so onboarding always
// offers the same choices PV itself has configured, and stays in sync if those change.
export const OnboardingAttributeOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  values: z.array(z.string()),
});

export const GetOnboardingAttributeOptionsResponseSchema = SuccessResponseSchema(
  z.object({ options: z.array(OnboardingAttributeOptionSchema) })
);
