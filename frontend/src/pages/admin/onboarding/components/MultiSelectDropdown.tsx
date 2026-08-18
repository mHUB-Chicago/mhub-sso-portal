import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MultiSelectDropdownProps {
  id: string;
  label: string;
  placeholder?: string;
  options: string[];
  values: string[];
  onValuesChange: (values: string[]) => void;
}

export const MultiSelectDropdown = ({
  id,
  label,
  placeholder,
  options,
  values,
  onValuesChange,
}: MultiSelectDropdownProps) => {
  const [open, setOpen] = useState(false);

  const toggle = (option: string) => {
    onValuesChange(values.includes(option) ? values.filter((existing) => existing !== option) : [...values, option]);
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="mt-1 h-auto min-h-9 w-full justify-between font-normal"
          >
            <span className={cn("truncate text-left", values.length === 0 && "text-muted-foreground")}>
              {values.length > 0 ? values.join(", ") : placeholder || "Select..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandList>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option} value={option} onSelect={() => toggle(option)}>
                    <Check className={cn("mr-2 h-4 w-4", values.includes(option) ? "opacity-100" : "opacity-0")} />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
