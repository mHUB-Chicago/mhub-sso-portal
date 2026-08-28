import { MultiSelectDropdown } from "@/pages/admin/onboarding/components/MultiSelectDropdown";
import type { OnboardingMembershipPackage } from "@/store/api/onboardingApi";

interface PublicAddonMembershipsStepProps {
  companyName?: string;
  values: string[];
  onChange: (values: string[]) => void;
  packages: OnboardingMembershipPackage[];
}

export const PublicAddonMembershipsStep = ({
  companyName,
  values,
  onChange,
  packages,
}: PublicAddonMembershipsStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership</h2>
        <p className="text-gray-600">
          {companyName ? `Inherits ${companyName}'s primary membership automatically` : "Inherits the company's primary membership automatically"}
          {" "}— no need to select one here. Choose any add-ons you might also want.
        </p>
      </div>

      {packages.length === 0 ? (
        <p className="text-sm text-gray-400">No add-on memberships are currently available.</p>
      ) : (
        <MultiSelectDropdown
          id="addonMemberships"
          label="Add-on Memberships (optional)"
          placeholder="Select any add-ons…"
          options={packages.map((pkg) => pkg.name)}
          values={values}
          onValuesChange={onChange}
        />
      )}
    </div>
  );
};
