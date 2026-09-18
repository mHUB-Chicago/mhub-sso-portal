import { FileText, Download, Info } from "lucide-react";

const AGREEMENT_PDF_URL = "/mHUB_Membership_Agreement_2026.pdf";

// Read-only/informational — the actual e-signing (checkbox + typed/drawn signature)
// always happens on the member's own account after they log in
// (frontend/src/pages/agreement/index.tsx), never here, even in "Admin fills out"
// mode. This step just previews the document and sets that expectation for the admin.
export const AgreementInfoStep = () => (
  <div className="space-y-6">
    <div>
      <h2 className="mb-2 text-2xl font-semibold">Membership Agreement</h2>
      <p className="text-gray-600">
        The member reviews and signs this agreement themselves, after logging in — it isn&apos;t
        filled out here, even in Admin mode.
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

    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <Info className="h-4 w-4 flex-shrink-0" />
      <p>
        After the member sets their password, they&apos;ll be taken to sign this agreement on their
        own account (typed or drawn signature) before continuing to the payment form. Once signed,
        the signed copy is downloadable from their user profile.
      </p>
    </div>
  </div>
);
