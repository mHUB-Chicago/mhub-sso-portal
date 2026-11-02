import { useState } from "react";
import { Check, AlertTriangle, Loader2, Building2, User as UserIcon, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCompleteOffboardingMutation,
  useMarkExternalAccountsRemovedMutation,
  useRemoveOffboardingAccessMutation,
  type OffboardingRecord,
} from "@/store/api/offboardingApi";
import { OffboardingViaPill, MemberSourcePill } from "./pills";
import { OFFBOARDING_STEPS as STEPS, offboardingStepState, stepDate } from "./steps";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const errorMessage = (err: unknown) =>
  err && typeof err === "object" && "data" in err
    ? (err as { data?: { message?: string } }).data?.message
    : undefined;

interface OffboardingProgressModalProps {
  record: OffboardingRecord;
  open: boolean;
  onClose: () => void;
}

export function OffboardingProgressModal({ record: initialRecord, open, onClose }: OffboardingProgressModalProps) {
  const [record, setRecord] = useState(initialRecord);
  const [removeAccess, { isLoading: isRemoving }] = useRemoveOffboardingAccessMutation();
  const [markExternalRemoved, { isLoading: isMarkingExternal }] = useMarkExternalAccountsRemovedMutation();
  const [complete, { isLoading: isCompleting }] = useCompleteOffboardingMutation();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const doneCount = STEPS.filter((s) => stepDate(record, s.key)).length;
  const next = STEPS.find((s) => !stepDate(record, s.key));
  const isCompleted = !!record.completedAt;

  const handleRemoveAccess = async () => {
    try {
      const result = await removeAccess(record.id).unwrap();
      setRecord(result.data.record);
      setConfirmingRemove(false);
      toast.success(result.message);
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to remove SSO access.");
    }
  };

  const handleMarkExternalRemoved = async () => {
    try {
      const result = await markExternalRemoved(record.id).unwrap();
      setRecord(result.data.record);
      toast.success(result.message);
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to mark the external accounts as removed.");
    }
  };

  const handleComplete = async () => {
    try {
      const result = await complete(record.id).unwrap();
      toast.success(result.message);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to complete the offboarding.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {record.name}
            <OffboardingViaPill via={record.via} />
          </DialogTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            {record.type === "company" ? <Building2 className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
            {record.type === "company" ? "Company" : "Person"}
            <span>&bull;</span>
            <span className="text-gray-700">{record.email}</span>
            <span>&bull;</span>
            PV ID <span className="text-gray-700">{record.peopleVineId || "—"}</span>
            <span>&bull;</span>
            Added {new Date(record.createdAt).toLocaleString()}
            {record.via === "member" && (
              <>
                <span>&bull;</span>
                <span className="font-semibold text-red-600">Cancellation detected via webhook</span>
              </>
            )}
          </p>
        </DialogHeader>

        <div className="border rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold">Offboarding Progress</h3>
            <span className="text-xs text-muted-foreground">
              {doneCount} of {STEPS.length} complete
            </span>
          </div>
          <div className="flex overflow-x-auto pb-2">
            {STEPS.map((s, idx) => {
              const state = offboardingStepState(record, s.key);
              const date = stepDate(record, s.key);
              return (
                <div key={s.key} className="flex-1 min-w-[110px] relative text-center">
                  {idx < STEPS.length - 1 && (
                    <div className={`absolute top-4 left-1/2 w-full h-0.5 ${date ? "bg-green-500" : "bg-gray-200"}`} />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${
                      state === "done"
                        ? "bg-green-500 text-white"
                        : state === "warn"
                          ? "bg-red-500 text-white"
                          : state === "cur"
                            ? "bg-white border-2 border-brand shadow-[0_0_0_4px_rgba(224,129,61,0.15)]"
                            : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {state === "done" && <Check className="h-4 w-4" />}
                    {state === "warn" && <AlertTriangle className="h-4 w-4" />}
                    {state === "cur" && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                  </div>
                  <div className={`text-xs font-semibold px-1.5 leading-tight ${state === "pend" ? "text-muted-foreground font-normal" : ""}`}>
                    {s.label}
                  </div>
                  <div
                    className={`text-[11px] mt-1 ${
                      state === "done"
                        ? "text-green-600"
                        : state === "warn"
                          ? "text-red-600 font-semibold"
                          : state === "cur"
                            ? "text-brand font-semibold"
                            : "text-gray-300"
                    }`}
                  >
                    {date ? formatDate(date) : state === "warn" ? "Action needed" : state === "cur" ? "Current" : "Pending"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t mt-2 pt-3.5 text-sm text-gray-600">
            {next ? (
              <>
                Next step: <b className="text-gray-900">{next.label}</b>. {next.waiting}
              </>
            ) : (
              <b className="text-gray-900">Offboarding complete.</b>
            )}
          </div>
        </div>

        <div className="border rounded-xl overflow-hidden">
          <h3 className="text-sm font-semibold px-5 pt-4 pb-1">Step Detail</h3>
          <div className="divide-y">
            {STEPS.map((s) => {
              const state = offboardingStepState(record, s.key);
              const date = stepDate(record, s.key);
              return (
                <div key={s.key} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {date
                        ? `Completed ${formatDate(date)}${
                            s.key === "confirm" && record.completedByName
                              ? ` by ${record.completedByName}`
                              : s.key === "external" && record.externalRemovedByName
                                ? ` by ${record.externalRemovedByName}`
                                : ""
                          }`
                        : s.waiting}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      state === "done"
                        ? "bg-green-50 text-green-600"
                        : state === "warn"
                          ? "bg-red-50 text-red-600"
                          : state === "cur"
                            ? "bg-orange-50 text-brand"
                            : "bg-gray-100 text-muted-foreground"
                    }`}
                  >
                    {state === "done" ? "Complete" : state === "warn" ? "Action Needed" : state === "cur" ? "In Progress" : "Pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {record.type === "company" && record.members.length > 0 && (
          <div className="border rounded-xl overflow-hidden">
            <h3 className="text-sm font-semibold px-5 pt-4 pb-1">
              {record.accessRemovedAt ? "Members Offboarded With This Company" : "Linked Members"} ({record.members.length})
            </h3>
            <div className="divide-y">
              {record.members.map((m) => (
                <div key={m.userId} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {m.name || "—"}
                      <MemberSourcePill memberSource={m.memberSource} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  <span
                    className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      record.accessRemovedAt ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {record.accessRemovedAt ? `Access Removed ${formatDate(record.accessRemovedAt)}` : "Access Active"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isCompleted && !record.pvRemovedAt && (
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
            <div>
              <b>Manual step:</b> the membership and subscription must be removed in PeopleVine. The portal cannot edit
              memberships. The webhook records the change here automatically once it is made.
            </div>
          </div>
        )}

        {!isCompleted && !record.externalRemovedAt && (
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
            <div>
              <b>Manual step:</b> remove {record.type === "company" ? "each member's" : "the member's"} account in
              LearnWorlds, the Shop site and DigiFabster. The portal does not update these sites, so mark this step done
              once all three are removed.
            </div>
          </div>
        )}

        <div className="flex justify-end items-center gap-2 pt-1 flex-wrap">
          {!isCompleted && !record.accessRemovedAt && !confirmingRemove && (
            <Button variant="destructive" size="sm" onClick={() => setConfirmingRemove(true)}>
              Remove SSO Access
            </Button>
          )}
          {confirmingRemove && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {record.type === "company"
                  ? "Remove SSO access for every member of this company?"
                  : "Remove all SSO access for this member?"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setConfirmingRemove(false)} disabled={isRemoving}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRemoveAccess} disabled={isRemoving}>
                {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {!isCompleted && !record.externalRemovedAt && (
            <Button variant="outline" size="sm" onClick={handleMarkExternalRemoved} disabled={isMarkingExternal}>
              {isMarkingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark External Accounts Removed"}
            </Button>
          )}
          {!isCompleted && (
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={!record.accessRemovedAt || !record.pvRemovedAt || !record.externalRemovedAt || isCompleting}
            >
              {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark Offboarding Complete"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
