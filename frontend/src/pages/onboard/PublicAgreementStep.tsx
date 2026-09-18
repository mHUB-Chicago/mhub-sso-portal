import { useEffect, useRef } from "react";
import { FileText, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgreementDetails } from "@/pages/admin/onboarding/types";

const AGREEMENT_PDF_URL = "/mHUB_Membership_Agreement_2026.pdf";

interface PublicAgreementStepProps {
  value: AgreementDetails;
  onChange: (agreement: AgreementDetails) => void;
}

// The real signing step — this is the only place a member ever actually signs the
// Membership Agreement (via the link an admin generated and sent them), not something
// an admin fills out on their behalf. Same UI/behavior as the mockup's Agreement step;
// mirrors frontend/src/pages/agreement/index.tsx's signature-capture logic, adapted to
// a controlled step component instead of its own standalone page.
export const PublicAgreementStep = ({ value, onChange }: PublicAgreementStepProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (value.signatureType !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 600;
    if (canvas.width !== width) {
      canvas.width = width;
      canvas.height = 130;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";

    let drawing = false;
    const pos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const point = "touches" in e ? e.touches[0] : e;
      return { x: point.clientX - rect.left, y: point.clientY - rect.top };
    };
    const start = (e: MouseEvent | TouchEvent) => {
      drawing = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    };
    const end = () => {
      if (drawing) {
        drawing = false;
        onChange({ ...value, signatureImageDataUrl: canvas.toDataURL("image/png") });
      }
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.signatureType]);

  const clearDrawnSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange({ ...value, signatureImageDataUrl: undefined });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership Agreement</h2>
        <p className="text-gray-600">Review the mHUB Membership Agreement, confirm your agreement, then sign below.</p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-gray-50 p-3.5">
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

      <div className="flex items-start gap-3 rounded-lg border p-3.5">
        <Checkbox
          id="agreeChk"
          checked={value.agreed}
          onCheckedChange={(checked) => onChange({ ...value, agreed: checked === true })}
          className="mt-0.5"
        />
        <Label htmlFor="agreeChk" className="cursor-pointer text-sm font-normal leading-relaxed">
          <span className="font-semibold">I agree to the Membership Agreement.</span>{" "}
          I confirm that I have read and understood the mHUB Membership Agreement, and I agree to be bound by its
          terms and conditions.
        </Label>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand">Signature</p>
        <div className="mb-4 flex gap-2">
          <Button
            type="button"
            variant={value.signatureType === "type" ? "default" : "outline"}
            size="sm"
            className={cn(value.signatureType === "type" && "bg-brand hover:bg-brand-hover")}
            onClick={() => onChange({ ...value, signatureType: "type" })}
          >
            Type
          </Button>
          <Button
            type="button"
            variant={value.signatureType === "draw" ? "default" : "outline"}
            size="sm"
            className={cn(value.signatureType === "draw" && "bg-brand hover:bg-brand-hover")}
            onClick={() => onChange({ ...value, signatureType: "draw" })}
          >
            Draw
          </Button>
        </div>

        {value.signatureType === "type" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="fullLegalName">
                Full Legal Name <span className="text-brand">*</span>
              </Label>
              <Input
                id="fullLegalName"
                autoComplete="name"
                placeholder="Type your full legal name"
                value={value.fullLegalName ?? ""}
                onChange={(e) => onChange({ ...value, fullLegalName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="flex min-h-[54px] items-center justify-center rounded-md border border-dashed px-4">
              {value.fullLegalName?.trim() ? (
                <p className="text-2xl" style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive' }}>
                  {value.fullLegalName}
                </p>
              ) : (
                <p className="text-xs text-gray-400">Your signature will appear here</p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair rounded-md border border-dashed bg-white"
              style={{ height: 130, touchAction: "none" }}
            />
            <button type="button" onClick={clearDrawnSignature} className="mt-2 text-xs text-gray-500 underline">
              Clear signature
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      </p>

      <p className="text-xs leading-relaxed text-gray-500">
        By continuing, you consent to sign this agreement electronically. Your electronic signature is legally
        binding, the same as a handwritten signature. A signed copy will be emailed to you and stored with your
        membership record.
      </p>
    </div>
  );
};

// Whether the current signature satisfies what's required to move past this step —
// mirrors the validation in common/schemas/onboarding.ts's OnboardingFormDataSchema
// superRefine, so the Continue button can't be enabled when the server would reject it.
export const isAgreementStepValid = (value: AgreementDetails | undefined): boolean => {
  if (!value?.agreed) return false;
  return value.signatureType === "type"
    ? !!value.fullLegalName && value.fullLegalName.trim().length > 1
    : !!value.signatureImageDataUrl;
};
