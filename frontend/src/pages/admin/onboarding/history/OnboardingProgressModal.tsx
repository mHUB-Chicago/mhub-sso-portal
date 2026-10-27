import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Lock, Loader2, Building2, User as UserIcon, FileText, Minus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useSkipOnboardingPaymentMutation,
  useSkipOnboardingServiceProvidersMutation,
  useUpdateOnboardingServiceProviderMutation,
  type OnboardingInProcessRecord,
  type OnboardingServiceProviderKey,
  type OnboardingServiceProviderStatus,
} from "@/store/api/onboardingApi";

type StepKey = "invite" | "account" | "payment" | "subscription" | "serviceProviders";

const STEPS: { key: StepKey; label: string; waiting: string }[] = [
  { key: "invite", label: "Invitation Sent", waiting: "The onboarding link was generated. Waiting for the invitation email to be sent." },
  { key: "account", label: "Company Account Created in PV", waiting: "Waiting for the company account to be created in PeopleVine." },
  { key: "payment", label: "Payment & Agreement Completed", waiting: "Waiting on the member to complete the payment form and accept the agreement and terms." },
  { key: "subscription", label: "Subscription Applied", waiting: "Waiting for the PeopleVine sync to confirm the membership subscription is active." },
  { key: "serviceProviders", label: "Service Provider Accounts", waiting: "Create each account with the member's SSO email, then mark it here." },
];

const SERVICE_PROVIDERS: { key: OnboardingServiceProviderKey; icon: string; name: string; description: string }[] = [
  { key: "learnWorlds", icon: "LW", name: "LearnWorlds", description: "Digital training portal" },
  { key: "digiFabster", icon: "DF", name: "DigiFabster", description: "3D printing services" },
];

const errorMessage = (err: unknown) =>
  err && typeof err === "object" && "data" in err
    ? (err as { data?: { message?: string } }).data?.message
    : undefined;

const stepsFor = (record: OnboardingInProcessRecord) =>
  record.via === "admin" ? STEPS.filter((s) => s.key !== "invite") : STEPS;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

interface OnboardingProgressModalProps {
  record: OnboardingInProcessRecord;
  open: boolean;
  onClose: () => void;
}

export function OnboardingProgressModal({ record: initialRecord, open, onClose }: OnboardingProgressModalProps) {
  const [record, setRecord] = useState(initialRecord);
  const [skipPayment, { isLoading: isSkipping }] = useSkipOnboardingPaymentMutation();
  const [skipServiceProviders, { isLoading: isSkippingServiceProviders }] = useSkipOnboardingServiceProvidersMutation();
  const [updateServiceProvider, { isLoading: isUpdatingServiceProvider }] = useUpdateOnboardingServiceProviderMutation();
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  const steps = stepsFor(record);
  let doneCount = 0;
  for (const s of steps) {
    if (record.steps[s.key]) doneCount++;
    else break;
  }
  const current = doneCount < steps.length ? steps[doneCount] : null;
  const canSkip = current?.key === "payment" || current?.key === "serviceProviders";
  const serviceProvidersSkipped = record.serviceProviders.skipped;
  const pendingServiceProviders = SERVICE_PROVIDERS.filter((sp) => !record.serviceProviders[sp.key].status).map((sp) => sp.name);
  const waitingText = (key: StepKey, fallback: string) =>
    key === "serviceProviders" && pendingServiceProviders.length
      ? `Waiting on mHub to create the ${pendingServiceProviders.join(" and ")} account${pendingServiceProviders.length > 1 ? "s" : ""} and grant access on the user.`
      : fallback;

  const handleSkip = async () => {
    try {
      if (current?.key === "payment") {
        const result = await skipPayment({ type: record.type, id: record.id }).unwrap();
        setRecord(result.data.record);
        toast.success("Payment & Agreement step skipped.");
      } else {
        const result = await skipServiceProviders({ type: record.type, id: record.id }).unwrap();
        setRecord(result.data.record);
        toast.success("Service Provider Accounts step marked as not required.");
      }
      setConfirmingSkip(false);
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to skip this step.");
    }
  };

  const handleServiceProvider = async (provider: OnboardingServiceProviderKey, status: OnboardingServiceProviderStatus | null) => {
    try {
      const result = await updateServiceProvider({ type: record.type, id: record.id, provider, status }).unwrap();
      setRecord(result.data.record);
      if (status === "created") toast.success(result.message);
    } catch (err) {
      toast.error(errorMessage(err) || "Failed to update the service provider account.");
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
              const notRequired = state === "done" && s.key === "serviceProviders" && serviceProvidersSkipped;
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
                      notRequired
                        ? "bg-gray-300 text-gray-600"
                        : state === "done"
                        ? "bg-green-500 text-white"
                        : state === "cur"
                          ? "bg-white border-2 border-brand shadow-[0_0_0_4px_rgba(224,129,61,0.15)]"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {state === "done" && (notRequired ? <Minus className="h-4 w-4" /> : <Check className="h-4 w-4" />)}
                    {state === "pend" && <Lock className="h-3.5 w-3.5" />}
                    {state === "cur" && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                  </div>
                  <div className={`text-xs font-semibold px-1.5 leading-tight ${state === "pend" ? "text-muted-foreground font-normal" : ""}`}>
                    {s.label}
                  </div>
                  <div
                    className={`text-[11px] mt-1 ${
                      notRequired ? "text-muted-foreground" : state === "done" ? "text-green-600" : state === "cur" ? "text-brand font-semibold" : "text-gray-300"
                    }`}
                  >
                    {notRequired
                      ? "Not Required"
                      : state === "done"
                      ? s.key === "payment" && record.paymentSkipped
                        ? `Skipped ${formatDate(record.steps[s.key]!)}`
                        : formatDate(record.steps[s.key]!)
                      : state === "cur" ? "Current" : "Locked"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t mt-2 pt-3.5 text-sm text-gray-600 flex items-center gap-1.5 flex-wrap">
            {current ? (
              <>
                Next step: <b className="text-gray-900">{current.label}</b>. {waitingText(current.key, current.waiting)}
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
              const isServiceProviders = s.key === "serviceProviders";
              const notRequired = isServiceProviders && serviceProvidersSkipped;
              const skipped = s.key === "payment" && record.paymentSkipped;
              const pillText = notRequired
                ? "Not Required"
                : state === "done" ? (skipped ? "Skipped" : "Complete") : state === "cur" ? "In Progress" : "Pending";
              const ts = notRequired
                ? "Marked as not required for this membership."
                : state === "done"
                ? isServiceProviders
                  ? `All accounts handled ${formatDate(record.steps[s.key]!)}`
                  : `${skipped ? "Skipped by admin" : "Completed"} ${formatDate(record.steps[s.key]!)}`
                : state === "cur" ? s.waiting : "Not started";
              return (
                <div key={s.key} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{isServiceProviders ? "Service Provider Accounts Created" : s.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{ts}</div>
                  </div>
                  <span
                    className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      notRequired
                        ? "bg-gray-100 text-gray-500"
                        : state === "done"
                        ? skipped
                          ? "bg-amber-50 text-amber-600"
                          : "bg-green-50 text-green-600"
                        : state === "cur"
                          ? "bg-orange-50 text-brand"
                          : "bg-gray-100 text-muted-foreground"
                    }`}
                  >
                    {pillText}
                  </span>
                </div>
                {isServiceProviders && !notRequired && state !== "pend" && (
                  <div className="mt-2.5 border rounded-lg bg-gray-50/60 divide-y">
                    {SERVICE_PROVIDERS.map((sp) => {
                      const status = record.serviceProviders[sp.key].status;
                      return (
                        <div key={sp.key} className="flex items-center gap-3 px-3.5 py-2.5">
                          <div className="w-8 h-8 rounded-md bg-white border flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0">
                            {sp.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold">{sp.name}</div>
                            <div className="text-xs text-muted-foreground">{sp.description}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {status ? (
                              <>
                                <span
                                  className={`text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                                    status === "created" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                                  }`}
                                >
                                  {status === "created" ? "Created" : "Not Needed"}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={isUpdatingServiceProvider}
                                  onClick={() => handleServiceProvider(sp.key, null)}
                                >
                                  Undo
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                                  disabled={isUpdatingServiceProvider}
                                  onClick={() => handleServiceProvider(sp.key, "created")}
                                >
                                  Mark Created
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={isUpdatingServiceProvider}
                                  onClick={() => handleServiceProvider(sp.key, "not_needed")}
                                >
                                  Not Needed
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </div>

        {current?.key === "serviceProviders" && (
          <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
            <div>
              <b>Manual step:</b> LearnWorlds and DigiFabster accounts are created by mHub in each platform, using the member's SSO email. Mark each one as it is done, or Not Needed if the membership does not include it. Marking an account as created also enables that app for the member in the portal. The Shop account creates itself on first login.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {record.submissionId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/admin/onboarding/${record.submissionId}`}>
                <FileText className="h-4 w-4 mr-1.5" />
                View Summary
              </Link>
            </Button>
          )}
          {canSkip && !confirmingSkip && (
            <Button variant="outline" size="sm" onClick={() => setConfirmingSkip(true)}>
              Skip This Step
            </Button>
          )}
          {confirmingSkip && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {current?.key === "payment"
                  ? "Skip Payment & Agreement? This is only for cases handled outside the PV form (e.g. invoiced directly)."
                  : "Mark Service Provider Accounts as not required? Use this when the membership does not include LearnWorlds or DigiFabster."}
              </span>
              <Button variant="outline" size="sm" onClick={() => setConfirmingSkip(false)} disabled={isSkipping || isSkippingServiceProviders}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSkip} disabled={isSkipping || isSkippingServiceProviders}>
                {isSkipping || isSkippingServiceProviders ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
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
