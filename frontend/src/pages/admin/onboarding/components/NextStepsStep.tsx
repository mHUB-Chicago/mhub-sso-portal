import { Button } from "@/components/ui/button";
import { ApiNote } from "./ApiNote";
import type { OnboardingMode } from "../types";

interface NextStepsStepProps {
  mode: OnboardingMode;
  isSubmitting: boolean;
  onSubmit: () => void;
}

const ADMIN_ITEMS = [
  {
    title: "Two profiles are created",
    description: "A company profile and a personal member profile are created in PeopleVine.",
  },
  {
    title: "Membership review",
    description: "An admin reviews and assigns the requested membership package in PeopleVine.",
  },
  {
    title: "Password reset on first login",
    description: "The user will be required to reset their password on first login.",
  },
];

const LINK_ITEMS = [
  {
    title: "A shareable link is generated",
    description: "Send it to the prospect so they can complete this same form themselves.",
  },
  {
    title: "The link expires after use",
    description: "Once submitted, the link cannot be reused.",
  },
  {
    title: "You're notified on submission",
    description: "The company and member profiles are created once they finish the form.",
  },
];

export const NextStepsStep = ({ mode, isSubmitting, onSubmit }: NextStepsStepProps) => {
  const items = mode === "admin" ? ADMIN_ITEMS : LINK_ITEMS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Next Steps</h2>
        <p className="text-gray-600">What happens after you submit.</p>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.title} className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
              {index + 1}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="text-sm text-gray-600">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={onSubmit} disabled={isSubmitting} className="w-full bg-brand hover:bg-brand-hover" size="lg">
        {mode === "admin"
          ? isSubmitting
            ? "Submitting..."
            : "Complete Onboarding"
          : isSubmitting
          ? "Generating Link..."
          : "Generate Shareable Link"}
      </Button>

      <ApiNote variant="info">
        This step does not write to PeopleVine yet — the backend integration is still pending confirmation
        of the open items above.
      </ApiNote>
    </div>
  );
};
