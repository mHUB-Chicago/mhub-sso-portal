import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/store";
import { companyApi } from "@/store/api/companyApi";
import { userApi, type Company } from "@/store/api/userApi";
import { useGetCompanyOffboardingMembersQuery, useOffboardCompanyMutation } from "@/store/api/offboardingApi";
import { MemberSourcePill } from "./pills";

interface CompanyOffboardDialogProps {
  company: Company;
  open: boolean;
  onClose: () => void;
}

export function CompanyOffboardDialog({ company, open, onClose }: CompanyOffboardDialogProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, isLoading, isError } = useGetCompanyOffboardingMembersQuery(company.id, {
    skip: !open,
    refetchOnMountOrArgChange: true,
  });
  const [offboardCompany, { isLoading: isOffboarding }] = useOffboardCompanyMutation();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const members = data?.data?.members ?? [];
  const selectedIds = members.filter((m) => !excluded.has(m.userId)).map((m) => m.userId);

  const toggle = (userId: string, checked: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleConfirm = async () => {
    try {
      const result = await offboardCompany({ companyId: company.id, userIds: selectedIds }).unwrap();
      dispatch(userApi.util.invalidateTags(["Users", "User"]));
      dispatch(companyApi.util.invalidateTags(["Companies", { type: "Company", id: company.id }]));
      toast.success(result.message);
      onClose();
      navigate("/admin/offboarding");
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { message?: string } }).data?.message
          : undefined;
      toast.error(message || "Failed to offboard this company.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isOffboarding && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offboard this company?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            You are about to offboard <b>{company.name}</b> and its linked members. This will:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Remove SSO access immediately for every selected member below.</li>
            <li>
              Add one company record to the Offboarding tracker listing all affected members, so the manual PeopleVine
              step is not forgotten.
            </li>
          </ol>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              Linked members losing access ({selectedIds.length} of {members.length})
            </div>
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : isError ? (
                <p className="px-3 py-4 text-center text-red-500">Failed to load linked members.</p>
              ) : members.length === 0 ? (
                <p className="px-3 py-4 text-center text-gray-500">No linked members. Only the company record will be added.</p>
              ) : (
                members.map((m) => (
                  <label key={m.userId} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                    <Checkbox
                      checked={!excluded.has(m.userId)}
                      onCheckedChange={(checked) => toggle(m.userId, checked === true)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{m.name || "—"}</span>
                      <span className="block text-xs text-gray-500 truncate">{m.email}</span>
                    </span>
                    <MemberSourcePill memberSource={m.memberSource} />
                  </label>
                ))
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            PeopleVine memberships and subscriptions are not changed. An admin must cancel the company subscription in
            PeopleVine; the tracker records it via webhook. Unchecked members keep their access.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isOffboarding}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isOffboarding || isLoading || isError}>
            {isOffboarding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Offboard Company & Members"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
