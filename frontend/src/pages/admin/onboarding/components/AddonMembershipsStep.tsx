import { Loader2 } from "lucide-react";
import { useGetOnboardingAddonPackagesQuery } from "@/store/api/onboardingApi";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

interface AddonMembershipsStepProps {
  companyName?: string;
  values: string[];
  onChange: (values: string[]) => void;
}

export const AddonMembershipsStep = ({ companyName, values, onChange }: AddonMembershipsStepProps) => {
  const { data, isLoading, error } = useGetOnboardingAddonPackagesQuery();
  const packages = data?.data?.packages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership</h2>
        <p className="text-gray-600">
          {companyName ? `Inherits ${companyName}'s primary membership automatically` : "Inherits the company's primary membership automatically"}
          {" "}— no need to select one here. Choose any add-ons this person might also want.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-9 items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading add-ons from PeopleVine…
        </div>
      ) : error ? (
        <p className="text-xs text-red-500">Failed to load add-on memberships from PeopleVine.</p>
      ) : packages.length === 0 ? (
        <p className="text-sm text-gray-400">No add-on memberships are currently configured in PeopleVine.</p>
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
