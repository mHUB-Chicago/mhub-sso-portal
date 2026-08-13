import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { OnboardingMembershipPackage } from "@/store/api/onboardingApi";

interface PublicPackageStepProps {
  value: string;
  onChange: (value: string) => void;
  packages: OnboardingMembershipPackage[];
  optional?: boolean;
}

export const PublicPackageStep = ({ value, onChange, packages, optional }: PublicPackageStepProps) => {
  const selected = packages.find((pkg) => pkg.id === value);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership Package</h2>
        <p className="text-gray-600">Which membership are you interested in?</p>
      </div>

      <div>
        <Label htmlFor="membershipPackage">
          Requested Package{" "}
          {optional ? <span className="text-gray-400">(optional)</span> : <span className="text-red-500">*</span>}
        </Label>
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
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" collisionPadding={16}>
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
      </div>
    </div>
  );
};
