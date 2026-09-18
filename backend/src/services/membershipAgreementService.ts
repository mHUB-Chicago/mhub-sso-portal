import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { MEMBERSHIP_AGREEMENT_TEMPLATE_BASE64 } from "@/assets/membershipAgreementTemplate";

// Byte-by-byte rather than btoa(String.fromCharCode(...bytes)) — the spread form can
// throw "Maximum call stack size exceeded" once the buffer gets into the hundreds of
// KB (the agreement template + a drawn signature easily do), see also saml.ts's
// base64EncodeUtf8 for the same pattern used elsewhere in this codebase.
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export interface SignMembershipAgreementInput {
  fullLegalName: string;
  signatureType: "type" | "draw";
  // data:image/png;base64,... — only present/used when signatureType === "draw".
  signatureImageDataUrl?: string;
  signedAt: Date;
}

// Additive only — this is a brand-new, purely local record of the member signing
// mHUB's own Membership Agreement PDF. It does not touch onboardingPaymentAgreementAt,
// the PV webhook cascade, or anything else in the existing payment-tracking flow; see
// membershipAgreementSignedAt/SignedName/Pdf on the User model.
//
// Appends a new final page to the real agreement template (rather than trying to
// overlay text onto the existing 12-page layout, which would need fragile
// per-version coordinate guesses) recording who signed, when, and their signature —
// typed name or the drawn signature image.
export const generateSignedMembershipAgreementPdf = async (
  input: SignMembershipAgreementInput
): Promise<string> => {
  const templateBytes = base64ToBytes(MEMBERSHIP_AGREEMENT_TEMPLATE_BASE64);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const dimText = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);

  let y = height - 90;
  page.drawText("Signature Confirmation", { x: 50, y, size: 18, font: boldFont, color: black });
  y -= 36;
  page.drawText(`Signed by: ${input.fullLegalName}`, { x: 50, y, size: 12, font, color: black });
  y -= 20;
  const dateLabel = input.signedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  page.drawText(`Date: ${dateLabel}`, { x: 50, y, size: 12, font, color: black });
  y -= 50;

  page.drawText("Signature:", { x: 50, y, size: 11, font, color: dimText });
  y -= 16;

  if (input.signatureType === "draw" && input.signatureImageDataUrl) {
    const match = input.signatureImageDataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (match) {
      const imgBytes = base64ToBytes(match[2]);
      const img = match[1] === "png" ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      const dims = img.scaleToFit(240, 90);
      page.drawImage(img, { x: 50, y: y - dims.height, width: dims.width, height: dims.height });
      y -= dims.height;
    }
  } else {
    // pdf-lib's standard fonts have no cursive/script style — the typed name above
    // already records the legal signature text; this just echoes it near the
    // signature line at a larger size for visual consistency with a signed document.
    page.drawText(input.fullLegalName, { x: 50, y: y - 24, size: 22, font: boldFont, color: black });
    y -= 34;
  }

  page.drawLine({ start: { x: 50, y: y - 6 }, end: { x: 300, y: y - 6 }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });

  page.drawText(
    "By signing above, the signer consents to sign this agreement electronically, with the",
    { x: 50, y: 70, size: 9, font, color: dimText }
  );
  page.drawText(
    "same legal effect as a handwritten signature.",
    { x: 50, y: 58, size: 9, font, color: dimText }
  );

  const outputBytes = await pdfDoc.save();
  return `data:application/pdf;base64,${bytesToBase64(outputBytes)}`;
};
