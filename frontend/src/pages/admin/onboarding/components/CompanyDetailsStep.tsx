import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiNote } from "./ApiNote";
import type { CompanyDetails } from "../types";

interface CompanyDetailsStepProps {
  value: CompanyDetails;
  onChange: (field: keyof CompanyDetails, fieldValue: string) => void;
}

export const CompanyDetailsStep = ({ value, onChange }: CompanyDetailsStepProps) => {
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
        <div>
          <Label htmlFor="companySize">Company Size (# employees)</Label>
          <Input
            id="companySize"
            type="number"
            min={0}
            value={value.size}
            onChange={(e) => onChange("size", e.target.value)}
            className="mt-1"
          />
        </div>
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

      <ApiNote>
        Company Name and Website map to standard PeopleVine fields. Registration requires a first and last
        name, but the sync expects a blank name on the company profile — resolved with a placeholder name
        that gets cleared after creation. Size, Founded, Industry, Incorporation, Funding Stage, Problem,
        and Target Market are custom attributes pending key confirmation from PeopleVine.
      </ApiNote>
    </div>
  );
};
