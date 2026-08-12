import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "./TagInput";
import type { SkillsDetails } from "../types";

type SkillsTextField = keyof Omit<SkillsDetails, "skills" | "shopSkills">;

interface SkillsStepProps {
  value: SkillsDetails;
  onChange: (field: SkillsTextField, fieldValue: string) => void;
  onSkillsChange: (skills: string[]) => void;
  onShopSkillsChange: (shopSkills: string[]) => void;
}

export const SkillsStep = ({ value, onChange, onSkillsChange, onShopSkillsChange }: SkillsStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Education & Technical Skills</h2>
        <p className="text-gray-600">
          Member background and capabilities, used for community matching and directory search.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="undergradSchool">Undergraduate Alma Mater</Label>
          <Input
            id="undergradSchool"
            value={value.undergradSchool}
            onChange={(e) => onChange("undergradSchool", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="undergradDegree">Undergraduate Degree</Label>
          <Input
            id="undergradDegree"
            value={value.undergradDegree}
            onChange={(e) => onChange("undergradDegree", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="gradSchool">Graduate Alma Mater</Label>
          <Input
            id="gradSchool"
            value={value.gradSchool}
            onChange={(e) => onChange("gradSchool", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="gradDegree">Graduate Degree</Label>
          <Input
            id="gradDegree"
            value={value.gradDegree}
            onChange={(e) => onChange("gradDegree", e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="industryExperience">Industry Experience</Label>
          <Input
            id="industryExperience"
            value={value.industryExperience}
            onChange={(e) => onChange("industryExperience", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <TagInput label="Skills & Knowledge" values={value.skills} onValuesChange={onSkillsChange} />
      <TagInput label="Shop Skills" values={value.shopSkills} onValuesChange={onShopSkillsChange} />
    </div>
  );
};
