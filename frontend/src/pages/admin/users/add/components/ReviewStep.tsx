import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface ReviewStepProps {
  formData: any;
  handleEditStep: (step: number) => void;
}

export const ReviewStep = ({ formData, handleEditStep }: ReviewStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Review User Details</h2>
        <p className="text-gray-600 mb-6">
          Please review the information below. You can edit any section before continuing to final actions.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Personal Information</CardTitle>
          <Button variant="link" onClick={() => handleEditStep(1)} className="text-pink-600">
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Full Name</p>
              <p className="mt-1">{formData.fullName || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Company</p>
              <p className="mt-1">{formData.company || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Email</p>
              <p className="mt-1">{formData.email || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Gender</p>
              <p className="mt-1 capitalize">{formData.gender || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Date of Birth</p>
              <p className="mt-1">
                {formData.dateOfBirth || "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Phone</p>
              <p className="mt-1">{formData.phone || "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-sm font-medium text-gray-500">Address</p>
              <p className="mt-1">{formData.address || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Access Levels</CardTitle>
          <Button variant="link" onClick={() => handleEditStep(2)} className="text-pink-600">
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {formData.digifaster && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Digifabster</span>
              </div>
            )}
            {formData.learnworlds && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Learnworlds</span>
              </div>
            )}
            {formData.mhubShop && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Mhub Shop (Wordpress)</span>
              </div>
            )}
            {formData.peoplevine && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>Peoplevine</span>
              </div>
            )}
            {!formData.digifaster && !formData.learnworlds && !formData.mhubShop && !formData.peoplevine && (
              <p className="text-gray-500">No platforms selected</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};