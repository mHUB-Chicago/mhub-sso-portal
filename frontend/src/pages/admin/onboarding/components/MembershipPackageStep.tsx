import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useGetOnboardingMembershipPackagesQuery } from "@/store/api/onboardingApi";

interface MembershipPackageStepProps {
  value: string;
  onChange: (value: string) => void;
}

export const MembershipPackageStep = ({ value, onChange }: MembershipPackageStepProps) => {
  const { data, isLoading, error } = useGetOnboardingMembershipPackagesQuery();
  const packages = data?.data?.packages ?? [];
  const selected = packages.find((pkg) => pkg.id === value);
  const [open, setOpen] = useState(false);

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
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                id="membershipPackage"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="mt-1 w-full justify-between font-normal"
              >
                <span className="truncate">{selected ? selected.name : "Select a package"}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-(--radix-popover-trigger-width) p-0"
              align="start"
              collisionPadding={16}
            >
              <Command>
                <CommandInput placeholder="Search packages…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>No packages found.</CommandEmpty>
                  <CommandGroup>
                    {packages.map((pkg) => (
                      <CommandItem
                        key={pkg.id}
                        value={pkg.name}
                        onSelect={() => {
                          onChange(pkg.id);
                          setOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${value === pkg.id ? "opacity-100" : "opacity-0"}`} />
                        {pkg.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};
