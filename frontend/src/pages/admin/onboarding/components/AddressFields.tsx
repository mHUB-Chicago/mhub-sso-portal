import { Input } from "@/components/ui/input";
import type { Address } from "../types";
import { COUNTRY_OPTIONS, getStateOptions } from "../locations";
import { OptionCombobox } from "./OptionCombobox";

interface AddressFieldsProps {
  idPrefix: string;
  value: Address;
  onChange: (field: keyof Address, fieldValue: string) => void;
}

export const AddressFields = ({ idPrefix, value, onChange }: AddressFieldsProps) => {
  const stateOptions = getStateOptions(value.country);

  const handleCountryChange = (country: string) => {
    onChange("country", country);
    const nextStateOptions = getStateOptions(country);
    const stateStillValid = nextStateOptions
      ? nextStateOptions.some((option) => option.value === value.state)
      : !getStateOptions(value.country);
    if (!stateStillValid) onChange("state", "");
  };

  return (
    <>
      <Input
        placeholder="Street address"
        autoComplete="street-address"
        value={value.street}
        onChange={(e) => onChange("street", e.target.value)}
      />
      <OptionCombobox
        id={`${idPrefix}Country`}
        placeholder="Country"
        searchPlaceholder="Search country..."
        options={COUNTRY_OPTIONS}
        value={value.country}
        onChange={handleCountryChange}
      />
      <div className="grid grid-cols-3 gap-4">
        <Input
          placeholder="City"
          autoComplete="address-level2"
          value={value.city}
          onChange={(e) => onChange("city", e.target.value)}
        />
        {stateOptions ? (
          <OptionCombobox
            id={`${idPrefix}State`}
            placeholder="State"
            searchPlaceholder="Search state..."
            options={stateOptions}
            value={value.state}
            onChange={(state) => onChange("state", state)}
          />
        ) : (
          <Input
            placeholder="State / Region"
            autoComplete="address-level1"
            value={value.state}
            onChange={(e) => onChange("state", e.target.value)}
          />
        )}
        <Input
          placeholder="Zip / Postal"
          autoComplete="postal-code"
          value={value.zip}
          onChange={(e) => onChange("zip", e.target.value)}
        />
      </div>
    </>
  );
};
