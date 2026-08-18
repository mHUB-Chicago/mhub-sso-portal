import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";
import { findAttributeOptionValues } from "../attributeOptionsUtil";
import type { CompanyDetails } from "../types";

interface CompanyDetailsStepProps {
  value: CompanyDetails;
  onChange: (field: keyof CompanyDetails, fieldValue: string) => void;
  attributeOptions?: OnboardingAttributeOption[];
}

export const CompanyDetailsStep = ({ value, onChange, attributeOptions }: CompanyDetailsStepProps) => {
  const companySizeOptions = findAttributeOptionValues(attributeOptions, "Total Number of Employees").map(
    (label) => ({ value: label, label })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Company Details</h2>
        <p className="text-gray-600">
          Creates the company profile in PeopleVine. Fields marked with an asterisk (*) are required.
        </p>
      </div>

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
        <FormSelect
          id="companySize"
          label="Company Size (# employees)"
          placeholder="Select company size"
          value={value.size ?? ""}
          options={companySizeOptions}
          onChange={(fieldValue) => onChange("size", fieldValue)}
        />
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
        <div>
          <Label htmlFor="companyIndustry">Industry</Label>
          <Input
            id="companyIndustry"
            value={value.industry}
            onChange={(e) => onChange("industry", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="companyIncorporation">Incorporation Status</Label>
          <Input
            id="companyIncorporation"
            value={value.incorporation}
            onChange={(e) => onChange("incorporation", e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="companyFunding">Current Funding Stage</Label>
          <Input
            id="companyFunding"
            value={value.fundingStage}
            onChange={(e) => onChange("fundingStage", e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="companyLogo">Company Logo</Label>
          <Input id="companyLogo" type="file" accept="image/*" className="mt-1" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="companyProblem">What problem are you solving?</Label>
          <Textarea
            id="companyProblem"
            value={value.problem}
            onChange={(e) => onChange("problem", e.target.value)}
            className="mt-1"
            rows={3}
          />
        </div>
        <div>
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
  );
};
