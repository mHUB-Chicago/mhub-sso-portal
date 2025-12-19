import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <img src="/logo.png" alt="MHUB Logo" className="h-12 mx-auto mb-8" />
        </div>

        <div className="space-y-4">
          <h1 className="text-9xl font-bold text-gray-200">404</h1>
          <h2 className="text-2xl font-semibold text-gray-900">Page Not Found</h2>
          <p className="text-gray-600 max-w-sm mx-auto">
            Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or you entered the wrong URL.
          </p>
        </div>

        <div className="space-y-3">
          <Button 
            onClick={() => navigate("/")}
            className="w-full bg-[#D30046] hover:bg-[#B8003C]"
          >
            <Home className="w-4 h-4 mr-2" />
            Go Home
          </Button>
          
          <Button 
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>

        <div className="text-sm text-gray-500">
          Need help? <a href="mailto:support@mhub.com" className="text-[#D30046] hover:underline">Contact support</a>
        </div>
      </div>
    </div>
  );
}