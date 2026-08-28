import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingScenario } from "../types";

interface OnboardingStepperProps {
  currentStep: number;
  scenario?: OnboardingScenario;
}

export const OnboardingStepper = ({ currentStep, scenario = "new_company" }: OnboardingStepperProps) => {
  const STEPS =
    scenario === "existing_company"
      ? ["Select Company", "Primary User", "Add-ons", "Skills", "Next Steps"]
      : ["Company", "Primary User", "Package", "Skills", "Next Steps"];

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between">
        {STEPS.map((label, index) => {
          const stepNumber = index + 1;
          const isDone = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;

          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    isDone && "border-brand bg-brand text-white",
                    isActive && !isDone && "border-brand bg-white text-brand",
                    !isActive && !isDone && "border-gray-300 bg-white text-gray-400"
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : stepNumber}
                </div>
                <span
                  className={cn(
                    "mt-2 whitespace-nowrap text-[11px] font-medium",
                    isActive ? "text-gray-900" : "text-gray-500"
                  )}
                >
                  {label}
                </span>
              </div>
              {stepNumber < STEPS.length && (
                <div className={cn("mx-2 h-0.5 flex-1", isDone ? "bg-brand" : "bg-gray-200")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
