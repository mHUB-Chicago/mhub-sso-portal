import { Building2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OnboardingMode, OnboardingScenario } from "../types";

interface ScenarioChooserStepProps {
  mode: OnboardingMode;
  value: OnboardingScenario;
  onChange: (scenario: OnboardingScenario) => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}

const CARDS: {
  scenario: OnboardingScenario;
  icon: typeof Building2;
  title: string;
  description: string;
  steps: string;
}[] = [
  {
    scenario: "new_company",
    icon: Building2,
    title: "New Company & User",
    description: "Create a brand-new company profile and its primary user in one flow.",
    steps: "Company → User → Package → Skills → Next Steps",
  },
  {
    scenario: "existing_company",
    icon: UserPlus,
    title: "Add User to Existing Company",
    description: "Add a new user under a company that already exists. No company details needed.",
    steps: "Select Company → User → Package (optional) → Skills → Next Steps",
  },
];

export const ScenarioChooserStep = ({ mode, value, onChange, onContinue, isSubmitting }: ScenarioChooserStepProps) => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-6">
        {CARDS.map(({ scenario, icon: Icon, title, description, steps }) => {
          const isSelected = value === scenario;
          return (
            <button
              key={scenario}
              type="button"
              onClick={() => onChange(scenario)}
              className={cn(
                "rounded-xl border-2 p-6 text-left transition-colors",
                isSelected ? "border-brand bg-brand/5" : "border-gray-200 bg-white hover:border-gray-300"
              )}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm">
                <Icon className="h-5 w-5 text-brand" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mb-4 text-sm text-gray-600">{description}</p>
              <div className="border-t pt-3 text-xs text-gray-400">{steps}</div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={isSubmitting} className="bg-brand hover:bg-brand-hover">
          {mode === "link" && isSubmitting ? "Generating Link..." : "Continue"}
        </Button>
      </div>
    </div>
  );
};
