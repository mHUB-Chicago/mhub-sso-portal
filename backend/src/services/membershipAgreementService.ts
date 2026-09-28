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

// Coordinates (PDF points, page is a standard 612x792 Letter page) of the three blank
// lines on page 12 of MEMBERSHIP_AGREEMENT_TEMPLATE_BASE64 — "Participant's Signature",
// "Participant's Name (Please Print)", and "Date". Measured directly off the rendered
// template (pdftoppm at 150dpi, converting pixel coords back to points); these are
// specific to this exact template file and will need re-measuring if that file is ever
// replaced with a differently-laid-out version.
const PAGE_12_INDEX = 11;
const SIGNATURE_BLOCK_X = 74;
const SIGNATURE_BLOCK_MAX_WIDTH = 210;
const SIGNATURE_LINE_Y = 518;
const NAME_LINE_Y = 481;
const DATE_LINE_Y = 445;
// Baseline sits just above the underline, like handwriting resting on a ruled line.
const TEXT_ABOVE_LINE = 4;

// This is a brand-new, purely local record of the member signing mHUB's own
// Membership Agreement PDF. It does not touch onboardingPaymentAgreementAt, the PV
// webhook cascade, or anything else in the existing payment-tracking flow; see
// membershipAgreementSignedAt/SignedName/Pdf on the User model.
//
// Stamps the name/signature/date straight onto the template's own page 12 signature
// block (see the PAGE_12_* constants above) — the output is the same 16-page template
// as 2026MemberAgreement1623Fulton.pdf, with nothing added or removed, just page 12's
// blank lines filled in.
export const generateSignedMembershipAgreementPdf = async (
  input: SignMembershipAgreementInput
): Promise<string> => {
  const templateBytes = base64ToBytes(MEMBERSHIP_AGREEMENT_TEMPLATE_BASE64);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const signaturePage = pdfDoc.getPages()[PAGE_12_INDEX];
  const page12Font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page12Black = rgb(0, 0, 0);

  if (input.signatureType === "draw" && input.signatureImageDataUrl) {
    const match = input.signatureImageDataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (match) {
      const imgBytes = base64ToBytes(match[2]);
      const img = match[1] === "png" ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
      // Capped height keeps a wide/tall drawn signature from crossing into the
      // "Participant's Name" line just above it.
      const dims = img.scaleToFit(SIGNATURE_BLOCK_MAX_WIDTH, 32);
      signaturePage.drawImage(img, {
        x: SIGNATURE_BLOCK_X,
        y: SIGNATURE_LINE_Y + TEXT_ABOVE_LINE,
        width: dims.width,
        height: dims.height,
      });
    }
  } else {
    signaturePage.drawText(input.fullLegalName, {
      x: SIGNATURE_BLOCK_X,
      y: SIGNATURE_LINE_Y + TEXT_ABOVE_LINE,
      size: 16,
      font: page12Font,
      color: page12Black,
    });
  }

  signaturePage.drawText(input.fullLegalName, {
    x: SIGNATURE_BLOCK_X,
    y: NAME_LINE_Y + TEXT_ABOVE_LINE,
    size: 12,
    font: page12Font,
    color: page12Black,
  });

  const page12DateLabel = input.signedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  signaturePage.drawText(page12DateLabel, {
    x: SIGNATURE_BLOCK_X,
    y: DATE_LINE_Y + TEXT_ABOVE_LINE,
    size: 12,
    font: page12Font,
    color: page12Black,
  });

  const outputBytes = await pdfDoc.save();
  return `data:application/pdf;base64,${bytesToBase64(outputBytes)}`;
};
