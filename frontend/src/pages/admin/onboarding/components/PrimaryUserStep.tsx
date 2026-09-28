import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/form-select";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";
import { findAttributeOptionValues } from "../attributeOptionsUtil";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { AddressFields } from "./AddressFields";
import { OptionCombobox } from "./OptionCombobox";
import { PHONE_CODE_OPTIONS, TITLE_OPTIONS } from "../locations";
import { SectionHeading } from "./SectionHeading";
import type { Address, OnboardingScenario, PrimaryUserDetails } from "../types";

// Phone and address are required here (not just cosmetically marked) because they ride
// straight into PeopleVine as the `mobile`/`address` objects on both the person's own
// record and, for new_company, the company's placeholder record (formData.user.address/
// phone is reused there — see peopleVinePortalService.ts). Leaving them blank doesn't
// just mean an incomplete profile — PV's own backend has been confirmed (via a live
// NullReferenceException) to crash on some of its endpoints when these fields are
// entirely absent from a create/update request rather than merely empty, so this isn't
// optional the way Title/LinkedIn/Bio genuinely are.
export const isPrimaryUserStepValid = (value: PrimaryUserDetails): boolean =>
  value.firstName.trim() !== "" &&
  value.lastName.trim() !== "" &&
  value.email.trim() !== "" &&
  value.phoneCountryCode.trim() !== "" &&
  value.phone.trim() !== "" &&
  value.address.street.trim() !== "" &&
  value.address.city.trim() !== "" &&
  value.address.state.trim() !== "" &&
  value.address.zip.trim() !== "" &&
  value.address.country.trim() !== "";

interface PrimaryUserStepProps {
  value: PrimaryUserDetails;
  onChange: (field: keyof Omit<PrimaryUserDetails, "address" | "ethnicity">, fieldValue: string) => void;
  onAddressChange: (field: keyof Address, fieldValue: string) => void;
  onEthnicityChange: (ethnicity: string[]) => void;
  attributeOptions?: OnboardingAttributeOption[];
  scenario: OnboardingScenario;
  companyEmail?: string;
}

export const PrimaryUserStep = ({
  value,
  onChange,
  onAddressChange,
  onEthnicityChange,
  attributeOptions,
  scenario,
  companyEmail,
}: PrimaryUserStepProps) => {
  // The "+company" alias is only ever generated for a brand-new company's own PV
  // customer (see buildCompanyPlaceholderEmail) — an existing_company submission never
  // creates one, so this preview would be misleading there. It's also redundant once the
  // user already entered their own company email on the previous step.
  const aliasPreview =
    scenario === "new_company" && !companyEmail?.trim() && value.email.includes("@")
      ? value.email.replace("@", "+company@")
      : "";
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
        <FormSelect
          id="userTitle"
          label="Title"
          placeholder="Select title"
          value={value.title}
          options={TITLE_OPTIONS}
          onChange={(title) => onChange("title", title)}
        />
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
          <Label htmlFor="userPhone">
            Phone <span className="text-red-500">*</span>
          </Label>
          <div className="mt-1 flex gap-2">
            <OptionCombobox
              id="userPhoneCountryCode"
              placeholder="+1"
              searchPlaceholder="Search country or code..."
              options={PHONE_CODE_OPTIONS}
              value={value.phoneCountryCode}
              onChange={(code) => onChange("phoneCountryCode", code)}
              className="w-24 shrink-0"
              contentClassName="w-80"
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
        <SectionHeading>Personal Address *</SectionHeading>
        <AddressFields idPrefix="userAddress" value={value.address} onChange={onAddressChange} />
      </div>
    </div>
  );
};
