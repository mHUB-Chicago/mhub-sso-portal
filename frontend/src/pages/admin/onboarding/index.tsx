import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCreateOnboardingSubmissionMutation } from "@/store/api/onboardingApi";
import { OnboardingStepper } from "./components/OnboardingStepper";
import { CompanyDetailsStep } from "./components/CompanyDetailsStep";
import { PrimaryUserStep } from "./components/PrimaryUserStep";
import { MembershipPackageStep } from "./components/MembershipPackageStep";
import { SkillsStep } from "./components/SkillsStep";
import { BillingStep } from "./components/BillingStep";
import { NextStepsStep } from "./components/NextStepsStep";
import type {
  Address,
  BillingDetails,
  CompanyDetails,
  OnboardingFormData,
  OnboardingMode,
  PaymentType,
  PrimaryUserDetails,
  SkillsDetails,
} from "./types";

const TOTAL_STEPS = 6;

const createInitialFormData = (): OnboardingFormData => ({
  mode: "admin",
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

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<OnboardingFormData>(createInitialFormData);
  const [createOnboardingSubmission] = useCreateOnboardingSubmissionMutation();

  const setMode = (mode: OnboardingMode) => {
    setFormData((prev) => ({ ...prev, mode }));
  };

  const updateCompanyField = (field: keyof CompanyDetails, fieldValue: string) => {
    setFormData((prev) => ({ ...prev, company: { ...prev.company, [field]: fieldValue } }));
  };

  const updateUserField = (field: keyof Omit<PrimaryUserDetails, "address">, fieldValue: string) => {
    setFormData((prev) => ({ ...prev, user: { ...prev.user, [field]: fieldValue } }));
  };

  const updateUserAddress = (field: keyof Address, fieldValue: string) => {
    setFormData((prev) => ({
      ...prev,
      user: { ...prev.user, address: { ...prev.user.address, [field]: fieldValue } },
    }));
  };

  const updateMembershipPackage = (fieldValue: string) => {
    setFormData((prev) => ({ ...prev, membershipPackage: fieldValue }));
  };

  const updateSkillsField = (
    field: keyof Omit<SkillsDetails, "skills" | "shopSkills">,
    fieldValue: string
  ) => {
    setFormData((prev) => ({ ...prev, skills: { ...prev.skills, [field]: fieldValue } }));
  };

  const updateSkills = (skills: string[]) => {
    setFormData((prev) => ({ ...prev, skills: { ...prev.skills, skills } }));
  };

  const updateShopSkills = (shopSkills: string[]) => {
    setFormData((prev) => ({ ...prev, skills: { ...prev.skills, shopSkills } }));
  };

  const updateBillingField = (
    field: keyof Omit<BillingDetails, "address" | "paymentType">,
    fieldValue: string
  ) => {
    setFormData((prev) => ({ ...prev, billing: { ...prev.billing, [field]: fieldValue } }));
  };

  const updateBillingAddress = (field: keyof Address, fieldValue: string) => {
    setFormData((prev) => ({
      ...prev,
      billing: { ...prev.billing, address: { ...prev.billing.address, [field]: fieldValue } },
    }));
  };

  const updatePaymentType = (paymentType: PaymentType) => {
    setFormData((prev) => ({ ...prev, billing: { ...prev.billing, paymentType } }));
  };

  const goNext = () => setCurrentStep((step) => Math.min(step + 1, TOTAL_STEPS));
  const goBack = () => setCurrentStep((step) => Math.max(step - 1, 1));

  const handleSubmit = async () => {
    if (formData.mode === "link") {
      setIsSubmitting(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast.info("Link generation is not yet wired to the backend.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const { cardNumber, cvc: _cvc, ...billingRest } = formData.billing;
      const submissionPayload = {
        ...formData,
        billing: {
          ...billingRest,
          ...(formData.billing.paymentType === "card" && cardNumber
            ? { cardLast4: cardNumber.slice(-4) }
            : {}),
        },
      };

      const result = await createOnboardingSubmission(submissionPayload).unwrap();
      toast.success("Onboarding submission recorded.");
      navigate(`/admin/onboarding/${result.data.submission.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit onboarding request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <CompanyDetailsStep value={formData.company} onChange={updateCompanyField} />;
      case 2:
        return (
          <PrimaryUserStep value={formData.user} onChange={updateUserField} onAddressChange={updateUserAddress} />
        );
      case 3:
        return <MembershipPackageStep value={formData.membershipPackage} onChange={updateMembershipPackage} />;
      case 4:
        return (
          <SkillsStep
            value={formData.skills}
            onChange={updateSkillsField}
            onSkillsChange={updateSkills}
            onShopSkillsChange={updateShopSkills}
          />
        );
      case 5:
        return (
          <BillingStep
            value={formData.billing}
            onChange={updateBillingField}
            onAddressChange={updateBillingAddress}
            onPaymentTypeChange={updatePaymentType}
          />
        );
      case 6:
        return <NextStepsStep mode={formData.mode} isSubmitting={isSubmitting} onSubmit={handleSubmit} />;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8">
      <Button variant="ghost" onClick={() => navigate("/admin/users")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Users
      </Button>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400">Home / Onboarding</p>
          <h1 className="text-3xl font-bold">New Member Onboarding</h1>
        </div>
        <div className="inline-flex rounded-full bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold",
              formData.mode === "admin" ? "bg-white text-brand shadow-sm" : "text-gray-500"
            )}
          >
            Admin fills out
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold",
              formData.mode === "link" ? "bg-white text-brand shadow-sm" : "text-gray-500"
            )}
          >
            Send a link
          </button>
        </div>
      </div>

      <OnboardingStepper currentStep={currentStep} />

      <div className="rounded-xl border bg-white p-10">
        {renderStep()}

        {currentStep < TOTAL_STEPS && (
          <div className="mt-8 flex justify-between">
            <Button variant="outline" onClick={goBack} disabled={currentStep === 1}>
              Back
            </Button>
            <Button onClick={goNext} className="bg-brand hover:bg-brand-hover">
              Continue
            </Button>
          </div>
        )}

        {currentStep === TOTAL_STEPS && (
          <div className="mt-8">
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingPage;
