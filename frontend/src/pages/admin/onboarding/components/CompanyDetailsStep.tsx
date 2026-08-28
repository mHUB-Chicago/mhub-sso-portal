import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";
import { findAttributeOptionValues } from "../attributeOptionsUtil";
import type { CompanyDetails } from "../types";
import { SectionHeading } from "./SectionHeading";

interface CompanyDetailsStepProps {
  value: CompanyDetails;
  onChange: (field: keyof CompanyDetails, fieldValue: string) => void;
  attributeOptions?: OnboardingAttributeOption[];
}

const INCORPORATION_STATUS_OPTIONS = [
  "Not yet incorporated",
  "LLC",
  "C-Corp",
  "S-Corp",
  "Non-profit",
  "Other",
].map((label) => ({ value: label, label }));

export const CompanyDetailsStep = ({ value, onChange, attributeOptions }: CompanyDetailsStepProps) => {
  const companySizeOptions = findAttributeOptionValues(attributeOptions, "Total Number of Employees").map(
    (label) => ({ value: label, label })
  );
  const industryOptions = findAttributeOptionValues(attributeOptions, "Company Concentration").map((label) => ({
    value: label,
    label,
  }));
  const fundingStageOptions = findAttributeOptionValues(attributeOptions, "Business Stage").map((label) => ({
    value: label,
    label,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Company Details</h2>
        <p className="text-gray-600">
          Creates the company profile in PeopleVine. Fields marked with an asterisk (*) are required.
        </p>
      </div>

      <div className="space-y-4">
        <SectionHeading>Company Information</SectionHeading>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="companyName">
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="companyName"
              value={value.name}
              onChange={(e) => onChange("name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="companyWebsite">Website URL</Label>
            <Input
              id="companyWebsite"
              type="url"
              value={value.website}
              onChange={(e) => onChange("website", e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="companyEmail">Business Email</Label>
            <Input
              id="companyEmail"
              type="email"
              value={value.email ?? ""}
              onChange={(e) => onChange("email", e.target.value)}
              className="mt-1"
              placeholder="e.g. hello@yourcompany.com"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional — used as the company's PeopleVine contact email. Leave blank to
              auto-generate one from the primary user's email below.
            </p>
          </div>
          <FormSelect
            id="companySize"
            label="Company Size (# employees)"
            placeholder="Select company size"
            value={value.size ?? ""}
            options={companySizeOptions}
            onChange={(fieldValue) => onChange("size", fieldValue)}
          />
          <div>
            <Label htmlFor="companyLogo">Company Logo</Label>
            <Input id="companyLogo" type="file" accept="image/*" className="mt-1" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <SectionHeading>Company Background</SectionHeading>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="companyFounded">Founded</Label>
            <Input
              id="companyFounded"
              type="date"
              value={value.founded}
              onChange={(e) => onChange("founded", e.target.value)}
              className="mt-1"
            />
          </div>
          <FormSelect
            id="companyIndustry"
            label="Industry"
            placeholder="Select industry"
            value={value.industry ?? ""}
            options={industryOptions}
            onChange={(fieldValue) => onChange("industry", fieldValue)}
          />
          <FormSelect
            id="companyIncorporation"
            label="Incorporation Status"
            placeholder="Select incorporation status"
            value={value.incorporation ?? ""}
            options={INCORPORATION_STATUS_OPTIONS}
            onChange={(fieldValue) => onChange("incorporation", fieldValue)}
          />
          <FormSelect
            id="companyFunding"
            label="Current Funding Stage"
            placeholder="Select funding stage"
            value={value.fundingStage ?? ""}
            options={fundingStageOptions}
            onChange={(fieldValue) => onChange("fundingStage", fieldValue)}
          />
          <div className="col-span-2">
            <Label htmlFor="companyProblem">What problem are you solving?</Label>
            <Textarea
              id="companyProblem"
              value={value.problem}
              onChange={(e) => onChange("problem", e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="companyTargetMarket">Target market / customer</Label>
            <Textarea
              id="companyTargetMarket"
              value={value.targetMarket}
              onChange={(e) => onChange("targetMarket", e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
