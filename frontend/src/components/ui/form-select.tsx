import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SelectOption {
  value: string;
  label: string;
}

interface FormSelectProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  required?: boolean;
  allowNull?: boolean;
  nullLabel?: string;
  className?: string;
}

export const FormSelect = ({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
  required = false,
  allowNull = true,
  nullLabel = "None",
  className = "",
}: FormSelectProps) => {
  const handleValueChange = (selectedValue: string) => {
    if (selectedValue === "__null__") {
      onChange("");
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select value={value || undefined} onValueChange={handleValueChange}>
        <SelectTrigger id={id} className="mt-1 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          {allowNull && (
            <SelectItem value="__null__" className="text-gray-500 italic">
              {nullLabel}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};