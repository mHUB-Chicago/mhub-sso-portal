import { useState } from "react";
import { FileText, Download, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AGREEMENT_PDF_URL = "/mHUB_Membership_Agreement_2026.pdf";

type PreviewSignatureMode = "type" | "draw";

// Visually matches the real signing UI (frontend/src/pages/agreement/index.tsx) that
// the member fills out on their own account, but every field here is disabled — the
// mockup's own note is explicit: "In Admin mode, prefer sending the agreement to the
// member for signature rather than signing on their behalf." This step is a preview
// of what the member will see, not a real form — nothing here is submitted anywhere.
export const AgreementInfoStep = () => {
  const [previewMode, setPreviewMode] = useState<PreviewSignatureMode>("type");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">
          Membership Agreement <span className="ml-1 align-middle text-xs font-semibold uppercase tracking-wide text-gray-400">Preview</span>
        </h2>
        <p className="text-gray-600">
          The member reviews and signs this agreement themselves, after logging in — it isn&apos;t
          filled out here, even in Admin mode. Shown below is exactly what they&apos;ll see.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-gray-50 p-4">
        <div className="flex h-10 w-9 flex-shrink-0 items-center justify-center rounded border bg-white text-red-600">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">mHUB Membership Agreement</p>
          <p className="text-xs text-gray-400">2026 &bull; 1623 W Fulton</p>
        </div>
        <a
          href={AGREEMENT_PDF_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          View
        </a>
        <a
          href={AGREEMENT_PDF_URL}
          download
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </div>

      <div className="flex items-start gap-3 rounded-lg border p-3.5 opacity-60">
        <Checkbox id="agreePreviewChk" checked={false} disabled className="mt-0.5" />
        <Label htmlFor="agreePreviewChk" className="text-sm font-normal leading-relaxed">
          <span className="font-semibold">I agree to the Membership Agreement.</span>{' '}
          I confirm that I have read and understood the mHUB Membership Agreement, and I agree to
          be bound by its terms and conditions.
        </Label>
      </div>

      <div className="opacity-60">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand">Signature</p>
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={previewMode === "type" ? "default" : "outline"}
            size="sm"
            className={cn(previewMode === "type" && "bg-brand hover:bg-brand-hover")}
            onClick={() => setPreviewMode("type")}
          >
            Type
          </Button>
          <Button
            type="button"
            variant={previewMode === "draw" ? "default" : "outline"}
            size="sm"
            className={cn(previewMode === "draw" && "bg-brand hover:bg-brand-hover")}
            onClick={() => setPreviewMode("draw")}
          >
            Draw
          </Button>
        </div>

        {previewMode === "type" ? (
          <div className="space-y-3">
            <div>
              <Label>
                Full Legal Name <span className="text-brand">*</span>
              </Label>
              <Input disabled placeholder="Type your full legal name" className="mt-1" />
            </div>
            <div className="flex min-h-[54px] items-center justify-center rounded-md border border-dashed px-4">
              <p className="text-xs text-gray-400">Your signature will appear here</p>
            </div>
          </div>
        ) : (
          <div className="flex h-[130px] items-center justify-center rounded-md border border-dashed bg-white">
            <p className="text-xs text-gray-400">Signature drawing area</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <Info className="h-4 w-4 flex-shrink-0" />
        <p>
          After the member sets their password, they&apos;ll be taken to sign this agreement on
          their own account before continuing to the payment form. Once signed, the signed copy is
          downloadable from their user profile.
        </p>
      </div>
    </div>
  );
};
