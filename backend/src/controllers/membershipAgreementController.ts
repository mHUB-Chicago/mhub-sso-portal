import { Context } from "hono";
import { AppType, JsonInput } from "..";
import { SignMembershipAgreementRequestSchema, SignMembershipAgreementResponseSchema } from "@common/schemas/membershipAgreement";
import { FailedResponseSchema } from "@common/schemas/response";
import { updateUser } from "@/services/userService";
import { generateSignedMembershipAgreementPdf } from "@/services/membershipAgreementService";

// Purely additive — records the member's own e-signature of mHUB's Membership
// Agreement PDF. Never touches onboardingPaymentAgreementAt or anything in the
// existing PV-driven payment/agreement webhook flow (peopleVineWebhookController.ts).
// Same auth pattern as handleChangePassword (loginController.ts): the route requires
// a session (not markPublic'd), so c.get("user") is the currently logged-in member —
// admins never sign on a member's behalf, see membershipAgreementService.ts.
export const handleSignMembershipAgreement = async (
  c: Context<AppType, string, JsonInput<typeof SignMembershipAgreementRequestSchema>>
) => {
  try {
    const { fullLegalName, signatureType, signatureImageDataUrl } = c.req.valid("json");
    const user = c.get("user");
    if (!user || !user.id) {
      throw new Error("User not authenticated");
    }
    if (signatureType === "draw" && !signatureImageDataUrl) {
      throw new Error("A drawn signature is required");
    }
    if (signatureType === "type" && (!fullLegalName || fullLegalName.trim().length < 2)) {
      throw new Error("Full legal name is required");
    }
    // Draw mode never collects a separate name field (matches the mockup) — the typed
    // name in type mode IS the signature, but a drawing needs a name recorded some
    // other way. Use the account's own name rather than trusting a client-supplied
    // one, since the client doesn't even prompt for it in this mode.
    const signedName = signatureType === "type" ? fullLegalName!.trim() : user.name;

    const signedAt = new Date();
    const membershipAgreementPdf = await generateSignedMembershipAgreementPdf({
      fullLegalName: signedName,
      signatureType,
      signatureImageDataUrl,
      signedAt,
    });

    await updateUser(c, {
      id: user.id,
      membershipAgreementSignedAt: signedAt,
      membershipAgreementSignedName: signedName,
      membershipAgreementPdf,
    });

    const response = SignMembershipAgreementResponseSchema.parse({
      success: true,
      message: "Membership agreement signed",
      data: { membershipAgreementSignedAt: signedAt },
    });
    return c.json(response);
  } catch (error) {
    console.error("handleSignMembershipAgreement error:", error);
    const response = FailedResponseSchema.parse({
      success: false,
      message: error instanceof Error ? error.message : "Failed to sign membership agreement",
    });
    return c.json(response, 400);
  }
};
