import { FormSelect } from "@/components/ui/form-select";
import type { OnboardingAttributeOption } from "@/store/api/onboardingApi";
import { findAttributeOptionValues } from "../attributeOptionsUtil";
import { CheckboxGroup } from "./CheckboxGroup";
import { SearchableSelect } from "./SearchableSelect";
import type { SkillsDetails } from "../types";

type SkillsTextField = keyof Omit<SkillsDetails, "skills" | "shopSkills">;

interface SkillsStepProps {
  value: SkillsDetails;
  onChange: (field: SkillsTextField, fieldValue: string) => void;
  onSkillsChange: (skills: string[]) => void;
  onShopSkillsChange: (shopSkills: string[]) => void;
  attributeOptions?: OnboardingAttributeOption[];
}

export const SkillsStep = ({
  value,
  onChange,
  onSkillsChange,
  onShopSkillsChange,
  attributeOptions,
}: SkillsStepProps) => {
  const toOptions = (values: string[]) => values.map((label) => ({ value: label, label }));

  const undergradSchoolOptions = findAttributeOptionValues(attributeOptions, "Undergraduate Alma Mater");
  const gradSchoolOptions = findAttributeOptionValues(attributeOptions, "Graduate School Alma Mater");
  const undergradDegreeOptions = toOptions(findAttributeOptionValues(attributeOptions, "Primary Undergrad Degree"));
  const gradDegreeOptions = toOptions(
    findAttributeOptionValues(attributeOptions, "Primary Graduate School Degree")
  );
  const industryExperienceOptions = toOptions(findAttributeOptionValues(attributeOptions, "Industry Experience"));
  const professionOptions = findAttributeOptionValues(attributeOptions, "Profession/ Knowledge");
  const shopSkillsOptions = findAttributeOptionValues(attributeOptions, "Shop Skills");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Education & Technical Skills</h2>
        <p className="text-gray-600">
          Member background and capabilities, used for community matching and directory search.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SearchableSelect
          id="undergradSchool"
          label="Undergraduate Alma Mater"
          value={value.undergradSchool}
          options={undergradSchoolOptions}
          onChange={(fieldValue) => onChange("undergradSchool", fieldValue)}
        />
        <FormSelect
          id="undergradDegree"
          label="Undergraduate Degree"
          placeholder="Select degree"
          value={value.undergradDegree}
          options={undergradDegreeOptions}
          onChange={(fieldValue) => onChange("undergradDegree", fieldValue)}
        />
        <SearchableSelect
          id="gradSchool"
          label="Graduate Alma Mater"
          value={value.gradSchool}
          options={gradSchoolOptions}
          onChange={(fieldValue) => onChange("gradSchool", fieldValue)}
        />
        <FormSelect
          id="gradDegree"
          label="Graduate Degree"
          placeholder="Select degree"
          value={value.gradDegree}
          options={gradDegreeOptions}
          onChange={(fieldValue) => onChange("gradDegree", fieldValue)}
        />
        <FormSelect
          id="industryExperience"
          label="Industry Experience"
          placeholder="Select years of experience"
          value={value.industryExperience}
          options={industryExperienceOptions}
          onChange={(fieldValue) => onChange("industryExperience", fieldValue)}
          className="col-span-2"
        />
      </div>

      <CheckboxGroup
        label="Skills & Knowledge"
        options={professionOptions}
        values={value.skills}
        onValuesChange={onSkillsChange}
      />
      <CheckboxGroup
        label="Shop Skills"
        options={shopSkillsOptions}
        values={value.shopSkills}
        onValuesChange={onShopSkillsChange}
      />
    </div>
  );
};
