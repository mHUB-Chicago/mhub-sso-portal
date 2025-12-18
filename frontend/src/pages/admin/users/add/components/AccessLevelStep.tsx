import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface AccessLevelStepProps {
  formData: any;
  handleInputChange: (field: string, value: any) => void;
}

export const AccessLevelStep = ({ formData, handleInputChange }: AccessLevelStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">User Onboarding</h2>
        <h3 className="text-xl font-medium mb-2">Access Level</h3>
        <p className="text-gray-600 mb-6">
          Define the user's access permissions for various internal platforms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assign Access Permissions</CardTitle>
          <CardDescription>Select the platforms the user needs access to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50">
            <Checkbox
              id="digifaster"
              checked={formData.digifaster}
              onCheckedChange={(checked) => handleInputChange("digifaster", checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="digifaster" className="text-base font-medium cursor-pointer">
                Digifabster
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Full access to Digifabster platform tools and resources.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50">
            <Checkbox
              id="learnworlds"
              checked={formData.learnworlds}
              onCheckedChange={(checked) => handleInputChange("learnworlds", checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="learnworlds" className="text-base font-medium cursor-pointer">
                Learnworlds
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Access to online courses, training materials, and educational content.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50">
            <Checkbox
              id="mhubShop"
              checked={formData.mhubShop}
              onCheckedChange={(checked) => handleInputChange("mhubShop", checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="mhubShop" className="text-base font-medium cursor-pointer">
                Mhub Shop (Wordpress)
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Permission to manage products, orders, and customer data on the Mhub e-commerce platform.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-4 border rounded-lg hover:bg-gray-50">
            <Checkbox
              id="peoplevine"
              checked={formData.peoplevine}
              onCheckedChange={(checked) => handleInputChange("peoplevine", checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="peoplevine" className="text-base font-medium cursor-pointer">
                Peoplevine
              </Label>
              <p className="text-sm text-gray-600 mt-1">
                Access to member profiles, event management, and community features.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};