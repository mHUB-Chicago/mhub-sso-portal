import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, RefreshCw, Eye, CheckCircle2, RotateCcw, UserPlus, Flag, Search, XCircle, Building2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveOnboardingSubmissionMutation,
  useDisapproveOnboardingSubmissionMutation,
  useFlagOnboardingSubmissionMutation,
  useGetOnboardingInProcessQuery,
  useGetOnboardingMembershipPackagesQuery,
  useGetOnboardingSubmissionsQuery,
  useReactivateOnboardingSubmissionMutation,
  useTreatOnboardingSubmissionAsNewMutation,
  type OnboardingInProcessRecord,
  type OnboardingSubmission,
} from "@/store/api/onboardingApi";
import { DuplicateMatchModal } from "./DuplicateMatchModal";
import { OnboardingProgressModal } from "./OnboardingProgressModal";
import { SyncStatusGate } from "@/components/sync-status-overlay";

type StepKey = "invite" | "account" | "payment" | "subscription";
const IN_PROCESS_STEPS: { key: StepKey; label: string }[] = [
  { key: "invite", label: "Invitation Sent" },
  { key: "account", label: "Company Account Created in PV" },
  { key: "payment", label: "Payment & Agreement Completed" },
  { key: "subscription", label: "Subscription Applied" },
];

const inProcessProgress = (record: OnboardingInProcessRecord) => {
  const steps = record.via === "admin" ? IN_PROCESS_STEPS.filter((s) => s.key !== "invite") : IN_PROCESS_STEPS;
  let doneCount = 0;
  for (const s of steps) {
    if (record.steps[s.key]) doneCount++;
    else break;
  }
  return { steps, doneCount, total: steps.length };
};

// "reviewed"/"completed" submission statuses still exist server-side (an audit trail
// of the admin-push action itself, and the approve/complete mutations still work) —
// they're just no longer separate tabs. "in_process" replaces both: it shows live
// Company/User records still awaiting a membership, auto-updated by the sync engine
// (webhook or batch/full), not OnboardingSubmission rows at all.
type TabKey = "pending_review" | "needs_attention" | "in_process";

type ConfirmAction =
  | { type: "approve"; submission: OnboardingSubmission }
  | { type: "disapprove"; submission: OnboardingSubmission }
  | { type: "reactivate"; submission: OnboardingSubmission }
  | { type: "treat_as_new"; submission: OnboardingSubmission }
  | { type: "flag"; submission: OnboardingSubmission };

type ViewMatch = { matchType: "company_email" | "user_email"; matchId: string };

const primaryContact = (submission: OnboardingSubmission) => {
  const { firstName, lastName } = submission.formData.user;
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return name || "—";
};

const matchLabel = (submission: OnboardingSubmission) => {
  if (submission.duplicateMatchType === "company_email") return "Matches an existing company";
  if (submission.duplicateMatchType === "user_email") return "Matches an existing user";
  return "—";
};

const viewMatchFor = (submission: OnboardingSubmission): ViewMatch | null => {
  if (submission.duplicateMatchType === "company_email" && submission.matchedCompanyId) {
    return { matchType: "company_email", matchId: submission.matchedCompanyId };
  }
  if (submission.duplicateMatchType === "user_email" && submission.matchedUserId) {
    return { matchType: "user_email", matchId: submission.matchedUserId };
  }
  return null;
};

const errorMessage = (err: unknown): string => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return "Something went wrong.";
};

export function AdminOnboardingHistoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("pending_review");
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [viewMatch, setViewMatch] = useState<ViewMatch | null>(null);
  const [inProcessSearch, setInProcessSearch] = useState("");
  const [progressRecord, setProgressRecord] = useState<OnboardingInProcessRecord | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useGetOnboardingSubmissionsQuery();
  const submissions = data?.data?.submissions ?? [];
  const {
    data: inProcessData,
    isFetching: isFetchingInProcess,
    refetch: refetchInProcess,
  } = useGetOnboardingInProcessQuery();
  const inProcessRecords = inProcessData?.data?.records ?? [];
  const { data: packagesData } = useGetOnboardingMembershipPackagesQuery();
  const membershipPackageName = (id: string): string =>
    packagesData?.data?.packages.find((pkg) => pkg.id === id)?.name ?? id;

  const pendingReview = submissions.filter((s) => s.status === "pending_review");
  const needsAttention = submissions.filter((s) => s.status === "needs_attention");

  const inProcessQuery = inProcessSearch.trim().toLowerCase();
  const inProcessRows = inProcessQuery
    ? inProcessRecords.filter((r) => [r.name, r.email].some((field) => field.toLowerCase().includes(inProcessQuery)))
    : inProcessRecords;

  const rows = activeTab === "pending_review" ? pendingReview : activeTab === "needs_attention" ? needsAttention : [];

  const [approve, { isLoading: isApproving }] = useApproveOnboardingSubmissionMutation();
  const [disapprove, { isLoading: isDisapproving }] = useDisapproveOnboardingSubmissionMutation();
  const [reactivate, { isLoading: isReactivating }] = useReactivateOnboardingSubmissionMutation();
  const [treatAsNew, { isLoading: isTreatingAsNew }] = useTreatOnboardingSubmissionAsNewMutation();
  const [flag, { isLoading: isFlagging }] = useFlagOnboardingSubmissionMutation();

  const isActing = isApproving || isDisapproving || isReactivating || isTreatingAsNew || isFlagging;

  const closeConfirm = () => {
    setConfirm(null);
    setFlagNote("");
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      switch (confirm.type) {
        case "approve": {
          const result = await approve(confirm.submission.id).unwrap();
          toast.success(result.message || "Submission pushed to PeopleVine.");
          break;
        }
        case "disapprove":
          await disapprove({ id: confirm.submission.id, resolutionNote: flagNote || undefined }).unwrap();
          toast.success("Submission disapproved.");
          break;
        case "reactivate":
          await reactivate(confirm.submission.id).unwrap();
          toast.success("Existing record reactivated.");
          break;
        case "treat_as_new":
          await treatAsNew(confirm.submission.id).unwrap();
          toast.success("Moved to Pending Review.");
          break;
        case "flag":
          await flag({ id: confirm.submission.id, resolutionNote: flagNote || undefined }).unwrap();
          toast.success("Flagged for manual cleanup.");
          break;
      }
      closeConfirm();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const tabs: { key: TabKey; label: string; badge: number }[] = [
    { key: "pending_review", label: "Pending Review", badge: pendingReview.length },
    { key: "needs_attention", label: "Needs Attention", badge: needsAttention.length },
    { key: "in_process", label: "In Process", badge: 0 },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load onboarding submissions</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SyncStatusGate />
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-2">
            <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
            <span className="mx-1">›</span>
            <span className="font-semibold text-gray-900">Onboarding</span>
          </nav>
          <h1 className="text-2xl font-bold">Onboarding</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchInProcess();
          }}
          disabled={isFetching || isFetchingInProcess}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching || isFetchingInProcess ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Onboarding tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[18px] h-[18px] px-1">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "in_process" && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={inProcessSearch}
            onChange={(e) => setInProcessSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
      )}

      {activeTab === "in_process" ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">PV ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created Via</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inProcessRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {inProcessQuery ? "No matches found" : "Nothing in process — no PV records are currently awaiting a membership"}
                  </td>
                </tr>
              ) : (
                inProcessRows.map((record) => {
                  const { steps, doneCount, total } = inProcessProgress(record);
                  const latestLabel =
                    doneCount === 0 ? "Not Started" : doneCount === total ? "Complete" : steps[doneCount - 1].label;
                  return (
                    <tr
                      key={`${record.type}-${record.id}`}
                      className="hover:bg-orange-50/40 cursor-pointer"
                      tabIndex={0}
                      role="button"
                      aria-label={`View onboarding progress for ${record.name}`}
                      onClick={() => setProgressRecord(record)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setProgressRecord(record);
                        }
                      }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {new Date(record.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          {record.type === "company" ? (
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                          ) : (
                            <UserIcon className="h-3.5 w-3.5 text-gray-400" />
                          )}
                          {record.type === "company" ? "Company" : "Person"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{record.name || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{record.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-700">{record.peopleVineId || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
                            record.via === "invite" ? "bg-indigo-50 text-indigo-600" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {record.via === "invite" ? "Invite Link" : "Admin Created"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className={`text-xs ${
                              doneCount === 0 ? "text-gray-400" : doneCount === total ? "font-bold text-green-600" : "text-gray-600"
                            }`}
                          >
                            {latestLabel}
                          </span>
                          <span className="flex gap-1">
                            {steps.map((s, idx) => (
                              <span
                                key={s.key}
                                className={`h-2 w-2 rounded-full ${
                                  idx < doneCount ? "bg-green-500" : idx === doneCount ? "bg-brand" : "bg-gray-200"
                                }`}
                              />
                            ))}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Primary Contact</th>
                {activeTab === "needs_attention" ? (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Duplicate Match</th>
                ) : (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Membership Package</th>
                )}
                <th className="text-left px-4 py-3 font-medium text-gray-600" style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {activeTab === "pending_review" && "No submissions pending review"}
                    {activeTab === "needs_attention" && "No duplicates flagged"}
                  </td>
                </tr>
              ) : (
                rows.map((submission) => (
                  <tr key={submission.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {new Date(submission.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{submission.formData.company.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{primaryContact(submission)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {activeTab === "needs_attention" ? (
                        viewMatchFor(submission) ? (
                          <button
                            type="button"
                            onClick={() => setViewMatch(viewMatchFor(submission))}
                            className="inline-flex items-center gap-1.5 text-brand hover:underline"
                          >
                            <Search className="h-3.5 w-3.5" />
                            {matchLabel(submission)}
                          </button>
                        ) : (
                          matchLabel(submission)
                        )
                      ) : (
                        (submission.formData.membershipPackage &&
                          membershipPackageName(submission.formData.membershipPackage)) ||
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/admin/onboarding/${submission.id}`}
                          className="text-muted-foreground hover:text-foreground p-1.5"
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {activeTab === "pending_review" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setConfirm({ type: "approve", submission })}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-red-600 hover:text-red-700"
                              onClick={() => setConfirm({ type: "disapprove", submission })}
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Disapprove
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setConfirm({ type: "reactivate", submission })}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Reactivate/Link
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setConfirm({ type: "treat_as_new", submission })}
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-1" />
                              Treat as New
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-red-600 hover:text-red-700"
                              onClick={() => setConfirm({ type: "flag", submission })}
                            >
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              Flag
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {confirm.type === "approve" && "Approve and push to PeopleVine?"}
                  {confirm.type === "disapprove" && "Disapprove this submission?"}
                  {confirm.type === "reactivate" && "Reactivate the existing record?"}
                  {confirm.type === "treat_as_new" && "Treat as a genuinely new customer?"}
                  {confirm.type === "flag" && "Flag for manual cleanup?"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {confirm.type === "approve" &&
                    "This registers the member in PeopleVine with their company info attached. PeopleVine has no API to assign a membership — mHub staff still need to do that manually afterward."}
                  {confirm.type === "disapprove" &&
                    "Marks this submission as disapproved and removes it from Pending Review. Nothing is sent to PeopleVine."}
                  {confirm.type === "reactivate" &&
                    "Flips the matched company/user back to active locally. Does not resurrect a cancelled PeopleVine subscription."}
                  {confirm.type === "treat_as_new" &&
                    "Moves this submission to Pending Review, ignoring the email match found."}
                  {confirm.type === "flag" &&
                    "Marks this submission for manual review — no automatic action is taken."}
                </p>
              </div>
            </div>

            {(confirm.type === "flag" || confirm.type === "disapprove") && (
              <Textarea
                placeholder={
                  confirm.type === "disapprove"
                    ? "Optional reason for disapproving…"
                    : "Optional note for whoever cleans this up…"
                }
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                className="text-sm"
              />
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={closeConfirm} disabled={isActing}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={isActing}>
                {isActing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Working…</> : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewMatch && (
        <DuplicateMatchModal
          matchType={viewMatch.matchType}
          matchId={viewMatch.matchId}
          open={!!viewMatch}
          onClose={() => setViewMatch(null)}
        />
      )}

      {progressRecord && (
        <OnboardingProgressModal
          record={progressRecord}
          open={!!progressRecord}
          onClose={() => setProgressRecord(null)}
        />
      )}
    </div>
  );
}
