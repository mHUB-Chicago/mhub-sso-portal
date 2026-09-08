import { useState } from "react";
import { Check, Lock, Loader2, Building2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApplyOnboardingSubscriptionMutation, type OnboardingInProcessRecord } from "@/store/api/onboardingApi";

type StepKey = "invite" | "account" | "payment" | "subscription";

const STEPS: { key: StepKey; label: string; waiting: string }[] = [
  { key: "invite", label: "Invitation Sent", waiting: "The onboarding link was generated. Waiting for the invitation email to be sent." },
  { key: "account", label: "Company Account Created in PV", waiting: "Waiting for the company account to be created in PeopleVine." },
  { key: "payment", label: "Payment & Agreement Completed", waiting: "Waiting on the member to complete the payment form and accept the agreement and terms." },
  { key: "subscription", label: "Subscription Applied", waiting: "Waiting for an admin to apply the membership subscription to the company profile." },
];

const stepsFor = (record: OnboardingInProcessRecord) =>
  record.via === "admin" ? STEPS.filter((s) => s.key !== "invite") : STEPS;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

interface OnboardingProgressModalProps {
  record: OnboardingInProcessRecord;
  open: boolean;
  onClose: () => void;
}

export function OnboardingProgressModal({ record, open, onClose }: OnboardingProgressModalProps) {
  const [applySubscription, { isLoading }] = useApplyOnboardingSubscriptionMutation();
  const [confirmingApply, setConfirmingApply] = useState(false);

  const steps = stepsFor(record);
  let doneCount = 0;
  for (const s of steps) {
    if (record.steps[s.key]) doneCount++;
    else break;
  }
  const current = doneCount < steps.length ? steps[doneCount] : null;
  const canApplySubscription = current?.key === "subscription";

  const handleApply = async () => {
    try {
      await applySubscription({ type: record.type, id: record.id }).unwrap();
      toast.success("Subscription marked as applied.");
      setConfirmingApply(false);
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err as { data?: { message?: string } }).data?.message
          : undefined;
      toast.error(message || "Failed to mark subscription as applied.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {record.name}
            <span
              className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${
                record.via === "invite" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-600"
              }`}
            >
              {record.via === "invite" ? "Invite Link" : "Admin Created"}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            {record.type === "company" ? <Building2 className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
            {record.type === "company" ? "Company" : "Person"}
            <span>&bull;</span>
            <span className="text-gray-700">{record.email}</span>
            <span>&bull;</span>
            PV ID <span className="text-gray-700">{record.peopleVineId || "—"}</span>
            <span>&bull;</span>
            Created {new Date(record.createdAt).toLocaleString()}
          </p>
        </DialogHeader>

        <div className="border rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold">Onboarding Progress</h3>
            <span className="text-xs text-muted-foreground">
              {doneCount} of {steps.length} complete
            </span>
          </div>
          <div className="flex overflow-x-auto pb-2">
            {steps.map((s, idx) => {
              const state = idx < doneCount ? "done" : idx === doneCount ? "cur" : "pend";
              return (
                <div key={s.key} className="flex-1 min-w-[110px] relative text-center">
                  {idx < steps.length - 1 && (
                    <div
                      className={`absolute top-4 left-1/2 w-full h-0.5 ${
                        idx < doneCount ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${
                      state === "done"
                        ? "bg-green-500 text-white"
                        : state === "cur"
                          ? "bg-white border-2 border-brand shadow-[0_0_0_4px_rgba(224,129,61,0.15)]"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {state === "done" && <Check className="h-4 w-4" />}
                    {state === "pend" && <Lock className="h-3.5 w-3.5" />}
                    {state === "cur" && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                  </div>
                  <div className={`text-xs font-semibold px-1.5 leading-tight ${state === "pend" ? "text-muted-foreground font-normal" : ""}`}>
                    {s.label}
                  </div>
                  <div
                    className={`text-[11px] mt-1 ${
                      state === "done" ? "text-green-600" : state === "cur" ? "text-brand font-semibold" : "text-gray-300"
                    }`}
                  >
                    {state === "done" ? formatDate(record.steps[s.key]!) : state === "cur" ? "Current" : "Locked"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t mt-2 pt-3.5 text-sm text-gray-600 flex items-center gap-1.5 flex-wrap">
            {current ? (
              <>
                Next step: <b className="text-gray-900">{current.label}</b>. {current.waiting}
              </>
            ) : (
              <b className="text-gray-900">Onboarding complete. All steps have been finished for this record.</b>
            )}
          </div>
        </div>

        <div className="border rounded-xl overflow-hidden">
          <h3 className="text-sm font-semibold px-5 pt-4 pb-1">Step Detail</h3>
          <div className="divide-y">
            {steps.map((s, idx) => {
              const state = idx < doneCount ? "done" : idx === doneCount ? "cur" : "pend";
              const pillText = state === "done" ? "Complete" : state === "cur" ? "In Progress" : "Pending";
              const ts = state === "done" ? `Completed ${formatDate(record.steps[s.key]!)}` : state === "cur" ? s.waiting : "Not started";
              return (
                <div key={s.key} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div>
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{ts}</div>
                  </div>
                  <span
                    className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      state === "done"
                        ? "bg-green-50 text-green-600"
                        : state === "cur"
                          ? "bg-orange-50 text-brand"
                          : "bg-gray-100 text-muted-foreground"
                    }`}
                  >
                    {pillText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          {canApplySubscription && !confirmingApply && (
            <Button size="sm" onClick={() => setConfirmingApply(true)}>
              Mark Subscription Applied
            </Button>
          )}
          {confirmingApply && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Confirm the membership was applied in PV?</span>
              <Button variant="outline" size="sm" onClick={() => setConfirmingApply(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApply} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
