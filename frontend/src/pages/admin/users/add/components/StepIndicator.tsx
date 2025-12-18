import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator = ({ currentStep, totalSteps }: StepIndicatorProps) => {
  const steps = [
    { number: 1, label: "Personal Information" },
    { number: 2, label: "Access Level" },
    { number: 3, label: "Review" },
    { number: 4, label: "Final Actions" },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between relative">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="relative flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  currentStep >= step.number
                    ? "bg-pink-600 border-pink-600 text-white"
                    : "bg-white border-gray-300 text-gray-500"
                )}
              >
                {currentStep > step.number ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{step.number}</span>
                )}
              </div>
              <span className="text-xs mt-2 text-center absolute top-12 whitespace-nowrap">
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-2">
                <div
                  className={cn(
                    "h-full transition-colors",
                    currentStep > step.number ? "bg-pink-600" : "bg-gray-300"
                  )}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};