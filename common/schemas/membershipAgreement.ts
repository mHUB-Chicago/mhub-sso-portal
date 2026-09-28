import z from "zod";
import { SuccessResponseSchema } from "./response";

// Purely additive record of a member e-signing mHUB's own Membership Agreement PDF —
// separate from, and does not affect, the existing PV-driven
// onboardingPaymentAgreementAt tracking. See membershipAgreementService.ts.
export const SignMembershipAgreementRequestSchema = z.object({
  // Required (min length enforced) only when signatureType === "type", where the
  // typed name doubles as the signature itself — validated in the controller, not
  // here. When signatureType === "draw", the mockup this is based on never collects a
  // separate name field at all; the controller falls back to the authenticated
  // user's own account name instead of trusting a client-supplied one.
  fullLegalName: z.string().optional(),
  signatureType: z.enum(["type", "draw"]),
  // Required when signatureType === "draw" — a PNG/JPEG data URI from the signature
  // canvas. Validated together in the controller (zod can't easily cross-validate
  // conditional requiredness here without a discriminated union, and the two client
  // call sites already only ever send one shape per signatureType).
  signatureImageDataUrl: z.string().optional(),
});

export const SignMembershipAgreementResponseSchema = SuccessResponseSchema(
  z.object({
    membershipAgreementSignedAt: z.coerce.date().transform((d) => d.toISOString()),
  })
);
