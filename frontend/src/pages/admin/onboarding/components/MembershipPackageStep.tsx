import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useGetOnboardingMembershipPackagesQuery } from "@/store/api/onboardingApi";

interface MembershipPackageStepProps {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}

export const MembershipPackageStep = ({ value, onChange, optional }: MembershipPackageStepProps) => {
  const { data, isLoading, error } = useGetOnboardingMembershipPackagesQuery();
  const packages = data?.data?.packages ?? [];
  const selected = packages.find((pkg) => pkg.id === value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Membership Package</h2>
        <p className="text-gray-600">
          The selected package is the prime membership the company profile should hold.
        </p>
      </div>

      <div ref={containerRef}>
        <Label htmlFor="membershipPackage">
          Requested Package{" "}
          {optional ? <span className="text-gray-400">(optional)</span> : <span className="text-red-500">*</span>}
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
          <>
            <Button
              id="membershipPackage"
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
              className="mt-1 w-full justify-between font-normal"
            >
              <span className="truncate">{selected ? selected.name : "Select a package"}</span>
              <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
            </Button>
            {open && (
              <Command className="mt-2 rounded-md border shadow-sm">
                <CommandInput placeholder="Search packages…" autoFocus />
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
            )}
          </>
        )}
      </div>
    </div>
  );
};
