import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";

// Looks up a PV attribute's option list by its exact PV-configured name (e.g. "Shop
// Skills", "Pronoun"). Returns an empty list while options are still loading or if PV
// doesn't have that attribute configured — callers render an empty/disabled control
// rather than crashing.
export const findAttributeOptionValues = (
  options: OnboardingAttributeOption[] | undefined,
  attributeName: string
): string[] => options?.find((option) => option.name === attributeName)?.values ?? [];
