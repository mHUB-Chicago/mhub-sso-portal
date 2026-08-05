import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CompanyViewModal } from "@/components/CompanyViewModal";
import { UserViewModal } from "@/components/UserViewModal";
import { useGetCompanyByIdQuery } from "@/store/api/companyApi";
import { useGetUserByIdQuery } from "@/store/api/userApi";

interface DuplicateMatchModalProps {
  matchType: "company_email" | "user_email";
  matchId: string;
  open: boolean;
  onClose: () => void;
}

export function DuplicateMatchModal({ matchType, matchId, open, onClose }: DuplicateMatchModalProps) {
  const isCompany = matchType === "company_email";

  const companyQuery = useGetCompanyByIdQuery(matchId, { skip: !open || !isCompany });
  const userQuery = useGetUserByIdQuery(matchId, { skip: !open || isCompany });

  const isLoading = isCompany ? companyQuery.isLoading : userQuery.isLoading;
  const error = isCompany ? companyQuery.error : userQuery.error;

  if (!open) return null;

  if (isLoading || error) {
    return (
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-sm">
          <div className="flex items-center justify-center py-10">
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <p className="text-sm text-red-500">Failed to load the matched record.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isCompany && companyQuery.data) {
    return <CompanyViewModal company={companyQuery.data.data.company} open={open} onClose={onClose} />;
  }

  if (!isCompany && userQuery.data) {
    const { user, company } = userQuery.data.data;
    return <UserViewModal user={{ ...user, companyName: company?.name }} open={open} onClose={onClose} />;
  }

  return null;
}
