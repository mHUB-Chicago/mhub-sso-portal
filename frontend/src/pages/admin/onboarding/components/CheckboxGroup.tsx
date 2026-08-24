import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "./SectionHeading";

interface CheckboxGroupProps {
  label: string;
  options: string[];
  values: string[];
  onValuesChange: (values: string[]) => void;
}

export const CheckboxGroup = ({ label, options, values, onValuesChange }: CheckboxGroupProps) => {
  const toggle = (option: string, checked: boolean) => {
    onValuesChange(checked ? [...values, option] : values.filter((existing) => existing !== option));
  };

  return (
    <div>
      <SectionHeading>{label}</SectionHeading>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {options.map((option) => {
          const id = `${label}-${option}`;
          return (
            <div key={option} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={values.includes(option)}
                onCheckedChange={(checked) => toggle(option, checked === true)}
              />
              <Label htmlFor={id} className="text-sm font-normal text-gray-700">
                {option}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
};
