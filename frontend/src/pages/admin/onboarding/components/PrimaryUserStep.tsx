import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";
import { findAttributeOptionValues } from "../attributeOptionsUtil";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { SectionHeading } from "./SectionHeading";
import type { Address, PrimaryUserDetails } from "../types";

interface PrimaryUserStepProps {
  value: PrimaryUserDetails;
  onChange: (field: keyof Omit<PrimaryUserDetails, "address" | "ethnicity">, fieldValue: string) => void;
  onAddressChange: (field: keyof Address, fieldValue: string) => void;
  onEthnicityChange: (ethnicity: string[]) => void;
  attributeOptions?: OnboardingAttributeOption[];
}

export const PrimaryUserStep = ({
  value,
  onChange,
  onAddressChange,
  onEthnicityChange,
  attributeOptions,
}: PrimaryUserStepProps) => {
  const aliasPreview = value.email.includes("@") ? value.email.replace("@", "+company@") : "";
  const genderOptions = findAttributeOptionValues(attributeOptions, "Gender").map((label) => ({
    value: label,
    label,
  }));
  const pronounOptions = findAttributeOptionValues(attributeOptions, "Pronoun").map((label) => ({
    value: label,
    label,
  }));
  const ethnicityOptions = findAttributeOptionValues(attributeOptions, "Ethnicity (choose all that apply)");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Primary User Details</h2>
        <p className="text-gray-600">Creates the main user profile — the primary contact for the company.</p>
      </div>

      <div className="space-y-4">
        <SectionHeading>Account Email</SectionHeading>
        <div>
          <Label htmlFor="userEmail">
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="userEmail"
            type="email"
            autoComplete="email"
            value={value.email}
            onChange={(e) => onChange("email", e.target.value)}
            className="mt-1"
          />
          {aliasPreview && (
            <p className="mt-1.5 text-xs text-emerald-700">
              The company profile will use {aliasPreview} automatically. Both addresses deliver to the same
              inbox.
            </p>
          )}
        </div>
      </div>

      <SectionHeading>Member Information</SectionHeading>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="userFirstName">
            First Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="userFirstName"
            value={value.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="userLastName">
            Last Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="userLastName"
            value={value.lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="userTitle">Title / Role</Label>
          <Input
            id="userTitle"
            value={value.title}
            onChange={(e) => onChange("title", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="userBirthday">Birthday</Label>
          <Input
            id="userBirthday"
            type="date"
            value={value.birthday}
            onChange={(e) => onChange("birthday", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="userPhone">Phone</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="userPhoneCountryCode"
              type="text"
              inputMode="numeric"
              placeholder="+1"
              autoComplete="tel-country-code"
              value={value.phoneCountryCode}
              onChange={(e) => onChange("phoneCountryCode", e.target.value)}
              className="w-16 shrink-0"
            />
            <Input
              id="userPhone"
              type="tel"
              autoComplete="tel-national"
              value={value.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="userLinkedin">LinkedIn</Label>
          <Input
            id="userLinkedin"
            type="url"
            value={value.linkedin}
            onChange={(e) => onChange("linkedin", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="userBio">Short Bio</Label>
        <Textarea
          id="userBio"
          value={value.bio}
          onChange={(e) => onChange("bio", e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>

      <SectionHeading>Member Identity</SectionHeading>
      <div className="grid grid-cols-2 gap-4">
        <FormSelect
          id="userGender"
          label="Gender"
          placeholder="Select gender"
          value={value.gender}
          options={genderOptions}
          onChange={(fieldValue) => onChange("gender", fieldValue)}
        />
        <FormSelect
          id="userPronouns"
          label="Pronouns"
          placeholder="Select pronouns"
          value={value.pronouns}
          options={pronounOptions}
          onChange={(fieldValue) => onChange("pronouns", fieldValue)}
        />
      </div>

      <MultiSelectDropdown
        id="userEthnicity"
        label="Ethnicity (choose all that apply)"
        placeholder="Select ethnicity"
        options={ethnicityOptions}
        values={value.ethnicity}
        onValuesChange={onEthnicityChange}
      />

      <div className="space-y-3">
        <SectionHeading>Personal Address</SectionHeading>
        <Input
          placeholder="Street address"
          autoComplete="street-address"
          value={value.address.street}
          onChange={(e) => onAddressChange("street", e.target.value)}
        />
        <div className="grid grid-cols-3 gap-4">
          <Input
            placeholder="City"
            autoComplete="address-level2"
            value={value.address.city}
            onChange={(e) => onAddressChange("city", e.target.value)}
          />
          <Input
            placeholder="State"
            autoComplete="address-level1"
            value={value.address.state}
            onChange={(e) => onAddressChange("state", e.target.value)}
          />
          <Input
            placeholder="Zip / Postal"
            autoComplete="postal-code"
            value={value.address.zip}
            onChange={(e) => onAddressChange("zip", e.target.value)}
          />
        </div>
        <Input
          placeholder="Country"
          autoComplete="country-name"
          value={value.address.country}
          onChange={(e) => onAddressChange("country", e.target.value)}
        />
      </div>
    </div>
  );
};
