import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCreateUserMutation } from "@/store/api/userApi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "./components/StepIndicator";
import { PersonalInformationStep } from "./components/PersonalInformationStep";
import { AccessLevelStep } from "./components/AccessLevelStep";
import { ReviewStep } from "./components/ReviewStep";
import { FinalActionsStep } from "./components/FinalActionsStep";

interface FormData {
  fullName: string;
  email: string;
  company: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  digifaster: boolean;
  learnworlds: boolean;
  mhubShop: boolean;
  peoplevine: boolean;
}

const AdminAddUserPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    company: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    address: "",
    digifaster: false,
    learnworlds: false,
    mhubShop: false,
    peoplevine: false,
  });

  const totalSteps = 4;

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const [createUser, { isLoading }] = useCreateUserMutation();

  const handleSaveAndFinish = async () => {
    try {
      await createUser(formData).unwrap();
      toast.success("User created successfully!");
      navigate("/admin/users");
    } catch (error) {
      toast.error("Failed to create user. Please try again.");
      console.error("Error creating user:", error);
    }
  };

  const handleSaveAndAddMore = async (sameCompany: boolean) => {
    try {
      await createUser(formData).unwrap();
      toast.success("User created successfully!");
      
      setCurrentStep(1);
      if (sameCompany) {
        setFormData(prev => ({
          ...prev,
          fullName: "",
          email: "",
          gender: "",
          dateOfBirth: "",
          phone: "",
          address: "",
        }));
      } else {
        setFormData({
          fullName: "",
          email: "",
          company: "",
          gender: "",
          dateOfBirth: "",
          phone: "",
          address: "",
          digifaster: false,
          learnworlds: false,
          mhubShop: false,
          peoplevine: false,
        });
      }
    } catch (error) {
      toast.error("Failed to create user. Please try again.");
      console.error("Error creating user:", error);
    }
  };

  const handleEditStep = (step: number) => {
    setCurrentStep(step);
  };






  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <PersonalInformationStep formData={formData} handleInputChange={handleInputChange} />;
      case 2:
        return <AccessLevelStep formData={formData} handleInputChange={handleInputChange} />;
      case 3:
        return <ReviewStep formData={formData} handleEditStep={handleEditStep} />;
      case 4:
        return (
          <FinalActionsStep 
            handleSaveAndFinish={handleSaveAndFinish}
            handleSaveAndAddMore={handleSaveAndAddMore}
            isLoading={isLoading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/users")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Button>
        
        <div className="text-center mb-2">
          <p className="text-sm text-gray-600">Step {currentStep} of {totalSteps}</p>
        </div>
      </div>

      <div className="mt-12">
        <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
      </div>

      <div className="mt-16">
        {renderCurrentStep()}
      </div>

      <div className="flex justify-between mt-8">
        {currentStep > 1 && currentStep < 4 && (
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
        )}
        {currentStep < 3 && (
          <Button 
            onClick={handleNext}
            className="ml-auto bg-pink-600 hover:bg-pink-700"
          >
            Next
          </Button>
        )}
        {currentStep === 3 && (
          <Button 
            onClick={handleNext}
            className="ml-auto bg-pink-600 hover:bg-pink-700"
          >
            Continue
          </Button>
        )}
      </div>
    </div>
  );
};

export default AdminAddUserPage;