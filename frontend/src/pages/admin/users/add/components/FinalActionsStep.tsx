import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FinalActionsStepProps {
  handleSaveAndFinish: () => void;
  handleSaveAndAddMore: (sameCompany: boolean) => void;
  isLoading: boolean;
}

export const FinalActionsStep = ({ 
  handleSaveAndFinish, 
  handleSaveAndAddMore, 
  isLoading 
}: FinalActionsStepProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">User Onboarding - Final Actions</h2>
        <p className="text-gray-600 mb-6">
          Choose an action to finalize the user creation process or continue adding more users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Finalize User Creation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleSaveAndFinish}
            className="w-full bg-pink-600 hover:bg-pink-700"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? "Creating User..." : "Save and Finish"}
          </Button>
          
          <Button
            onClick={() => handleSaveAndAddMore(true)}
            variant="outline"
            className="w-full"
            size="lg"
            disabled={isLoading}
          >
            Save and add more for this company
          </Button>
          
          <Button
            onClick={() => handleSaveAndAddMore(false)}
            variant="outline"
            className="w-full"
            size="lg"
            disabled={isLoading}
          >
            Save and add more for a different company
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};