import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGetOnboardingLinkQuery, useSubmitOnboardingLinkMutation } from "@/store/api/publicOnboardingApi";
import { CompanyDetailsStep } from "@/pages/admin/onboarding/components/CompanyDetailsStep";
import { PrimaryUserStep } from "@/pages/admin/onboarding/components/PrimaryUserStep";
import { SkillsStep } from "@/pages/admin/onboarding/components/SkillsStep";
import { PublicPackageStep } from "./PublicPackageStep";
import { PublicSelectCompanyStep } from "./PublicSelectCompanyStep";
import type {
  Address,
  CompanyDetails,
  OnboardingFormData,
  PrimaryUserDetails,
  SkillsDetails,
} from "@/pages/admin/onboarding/types";

const TOTAL_STEPS = 4;

const createInitialFormData = (scenario: "new_company" | "existing_company"): OnboardingFormData => ({
  mode: "link",
  scenario,
  companyId: undefined,
  company: {
    name: "",
    website: "",
    size: "",
    founded: "",
    industry: "",
    incorporation: "",
    fundingStage: "",
    problem: "",
    targetMarket: "",
  },
  user: {
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    birthday: "",
    phoneCountryCode: "",
    phone: "",
    linkedin: "",
    bio: "",
    gender: "",
    pronouns: "",
    ethnicity: "",
    address: { street: "", city: "", state: "", zip: "", country: "" },
  },
  membershipPackage: "",
  skills: {
    undergradSchool: "",
    undergradDegree: "",
    gradSchool: "",
    gradDegree: "",
    industryExperience: "",
    skills: [],
    shopSkills: [],
  },
  billing: {
    paymentType: "card",
    nameOnCard: "",
    cardNumber: "",
    expiration: "",
    cvc: "",
    address: { street: "", city: "", state: "", zip: "", country: "" },
  },
});

const PublicOnboardingPage = () => {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useGetOnboardingLinkQuery(token ?? "", { skip: !token });
  const [submitOnboardingLink] = useSubmitOnboardingLinkMutation();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<OnboardingFormData | null>(null);

  const linkInfo = data?.data;

  useEffect(() => {
    if (linkInfo && !formData) {
      setFormData(createInitialFormData(linkInfo.scenario));
    }
  }, [linkInfo, formData]);

  if (isLoading || (linkInfo && !formData)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !linkInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Link unavailable</h1>
          <p className="text-sm text-gray-600">
            This onboarding link is invalid, has already been used, or has expired. Please reach out to whoever
            sent it for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Thanks — you're all set</h1>
          <p className="text-sm text-gray-600">
            Your information has been submitted for review. We'll be in touch once it's been processed.
          </p>
        </div>
      </div>
    );
  }

  const isExistingCompany = linkInfo.scenario === "existing_company";

  const updateCompanyId = (companyId: string) => {
    setFormData((prev) => (prev ? { ...prev, companyId } : prev));
  };

  const updateCompanyField = (field: keyof CompanyDetails, fieldValue: string) => {
    setFormData((prev) => (prev ? { ...prev, company: { ...prev.company, [field]: fieldValue } } : prev));
  };

  const updateUserField = (field: keyof Omit<PrimaryUserDetails, "address">, fieldValue: string) => {
    setFormData((prev) => (prev ? { ...prev, user: { ...prev.user, [field]: fieldValue } } : prev));
  };

  const updateUserAddress = (field: keyof Address, fieldValue: string) => {
    setFormData((prev) =>
      prev ? { ...prev, user: { ...prev.user, address: { ...prev.user.address, [field]: fieldValue } } } : prev
    );
  };

  const updateMembershipPackage = (fieldValue: string) => {
    setFormData((prev) => (prev ? { ...prev, membershipPackage: fieldValue } : prev));
  };

  const updateSkillsField = (field: keyof Omit<SkillsDetails, "skills" | "shopSkills">, fieldValue: string) => {
    setFormData((prev) => (prev ? { ...prev, skills: { ...prev.skills, [field]: fieldValue } } : prev));
  };

  const updateSkills = (skills: string[]) => {
    setFormData((prev) => (prev ? { ...prev, skills: { ...prev.skills, skills } } : prev));
  };

  const updateShopSkills = (shopSkills: string[]) => {
    setFormData((prev) => (prev ? { ...prev, skills: { ...prev.skills, shopSkills } } : prev));
  };

  const goNext = () => setCurrentStep((step) => Math.min(step + 1, TOTAL_STEPS));
  const goBack = () => setCurrentStep((step) => Math.max(step - 1, 1));

  const handleSubmit = async () => {
    if (!formData || !token) return;
    setIsSubmitting(true);
    try {
      await submitOnboardingLink({ token, formData }).unwrap();
      setIsSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    if (!formData) return null;
    switch (currentStep) {
      case 1:
        return isExistingCompany ? (
          <PublicSelectCompanyStep value={formData.companyId} onChange={updateCompanyId} companies={linkInfo.companies ?? []} />
        ) : (
          <CompanyDetailsStep value={formData.company} onChange={updateCompanyField} />
        );
      case 2:
        return (
          <PrimaryUserStep value={formData.user} onChange={updateUserField} onAddressChange={updateUserAddress} />
        );
      case 3:
        return (
          <PublicPackageStep
            value={formData.membershipPackage}
            onChange={updateMembershipPackage}
            packages={linkInfo.packages}
            optional={isExistingCompany}
          />
        );
      case 4:
        return (
          <SkillsStep
            value={formData.skills}
            onChange={updateSkillsField}
            onSkillsChange={updateSkills}
            onShopSkillsChange={updateShopSkills}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Member Onboarding</h1>
          <p className="mt-1 text-gray-600">Complete this form to get started.</p>
        </div>

        <div className="rounded-xl border bg-white p-10">
          {renderStep()}

          <div className="mt-8 flex justify-between">
            <Button variant="outline" onClick={goBack} disabled={currentStep === 1}>
              Back
            </Button>
            {currentStep < TOTAL_STEPS ? (
              <Button onClick={goNext} className="bg-brand hover:bg-brand-hover">
                Continue
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-brand hover:bg-brand-hover">
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicOnboardingPage;
