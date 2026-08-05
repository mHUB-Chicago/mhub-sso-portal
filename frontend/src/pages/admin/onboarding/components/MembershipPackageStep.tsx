import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetOnboardingMembershipPackagesQuery } from "@/store/api/onboardingApi";
import { ApiNote } from "./ApiNote";

interface MembershipPackageStepProps {
  value: string;
  onChange: (value: string) => void;
}

export const MembershipPackageStep = ({ value, onChange }: MembershipPackageStepProps) => {
  const { data, isLoading, error } = useGetOnboardingMembershipPackagesQuery();
  const packages = data?.data?.packages ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership Package</h2>
        <p className="text-gray-600">
          The selected package is the prime membership the company profile should hold.
        </p>
      </div>

      <div>
        <Label htmlFor="membershipPackage">
          Requested Package <span className="text-red-500">*</span>
        </Label>
        {isLoading ? (
          <div className="mt-1 flex h-9 items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading packages from PeopleVine…
          </div>
        ) : error ? (
          <p className="mt-1.5 text-xs text-red-500">
            Failed to load membership packages from PeopleVine.
          </p>
        ) : (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="membershipPackage" className="mt-1 w-full">
              <SelectValue placeholder="Select a package" />
            </SelectTrigger>
            <SelectContent>
              {packages.map((pkg) => (
                <SelectItem key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ApiNote>
        This list is pulled live from PeopleVine's product catalog, so the value stored here is the
        real PV product ID used when this submission is pushed to PeopleVine on approval.
      </ApiNote>
    </div>
  );
};
