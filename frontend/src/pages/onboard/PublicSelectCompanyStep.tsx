import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { PublicOnboardingCompanyOption } from "@/store/api/publicOnboardingApi";

interface PublicSelectCompanyStepProps {
  value: string | undefined;
  onChange: (companyId: string) => void;
  companies: PublicOnboardingCompanyOption[];
}

export const PublicSelectCompanyStep = ({ value, onChange, companies }: PublicSelectCompanyStepProps) => {
  const selected = companies.find((company) => company.id === value);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Select Your Company</h2>
        <p className="text-gray-600">Pick the company you belong to. No company details needed.</p>
      </div>

      <div>
        <Label htmlFor="existingCompany">
          Company <span className="text-red-500">*</span>
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="existingCompany"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="mt-1 w-full justify-between font-normal"
            >
              <span className="truncate">{selected ? selected.name : "Select a company"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" collisionPadding={16}>
            <Command>
              <CommandInput placeholder="Search companies…" />
              <CommandList className="max-h-64">
                <CommandEmpty>No companies found.</CommandEmpty>
                <CommandGroup>
                  {companies.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.name}
                      onSelect={() => {
                        onChange(company.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${value === company.id ? "opacity-100" : "opacity-0"}`} />
                      {company.name}
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
