import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";

interface PersonalInformationStepProps {
  formData: any;
  handleInputChange: (field: string, value: any) => void;
}

export const PersonalInformationStep = ({ formData, handleInputChange }: PersonalInformationStepProps) => {
  const companyOptions = [
    { value: "innovate-solutions", label: "Innovate Solutions Inc." },
    { value: "tech-corp", label: "Tech Corp" },
    { value: "digital-agency", label: "Digital Agency" },
  ];

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "other", label: "Other" },
    { value: "prefer-not-to-say", label: "Prefer not to say" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Personal Information</h2>
        <p className="text-gray-600 mb-6">
          Please provide the new user's personal details. Fields marked with an asterisk (*) are required.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fullName">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) => handleInputChange("fullName", e.target.value)}
              className="mt-1"
            />
          </div>
          <FormSelect
            id="company"
            label="Company"
            placeholder="Select a company"
            value={formData.company}
            options={companyOptions}
            onChange={(value) => handleInputChange("company", value)}
            required
            allowNull={false}
          />
          <div>
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="john.doe@example.com"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              className="mt-1"
            />
          </div>
          <FormSelect
            id="gender"
            label="Gender"
            placeholder="Select gender"
            value={formData.gender}
            options={genderOptions}
            onChange={(value) => handleInputChange("gender", value)}
            allowNull={true}
            nullLabel="Prefer not to say"
          />
        </div>
        
        <div className="mt-4">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Contact Details</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="(123) 456-7890"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="123 Main St, Anytown, USA 12345"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>
      </div>
    </div>
  );
};