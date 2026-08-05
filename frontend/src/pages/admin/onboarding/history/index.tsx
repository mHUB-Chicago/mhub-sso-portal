import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2, RefreshCw, Eye, CheckCircle2, RotateCcw, UserPlus, Flag, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveOnboardingSubmissionMutation,
  useFlagOnboardingSubmissionMutation,
  useGetOnboardingSubmissionsQuery,
  useReactivateOnboardingSubmissionMutation,
  useTreatOnboardingSubmissionAsNewMutation,
  type OnboardingSubmission,
} from "@/store/api/onboardingApi";
import { DuplicateMatchModal } from "./DuplicateMatchModal";

type TabKey = "pending_review" | "needs_attention";

type ConfirmAction =
  | { type: "approve"; submission: OnboardingSubmission }
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

  const { data, isLoading, isFetching, error, refetch } = useGetOnboardingSubmissionsQuery();
  const submissions = data?.data?.submissions ?? [];

  const pendingReview = submissions.filter((s) => s.status === "pending_review");
  const needsAttention = submissions.filter((s) => s.status === "needs_attention");
  const rows = activeTab === "pending_review" ? pendingReview : needsAttention;

  const [approve, { isLoading: isApproving }] = useApproveOnboardingSubmissionMutation();
  const [reactivate, { isLoading: isReactivating }] = useReactivateOnboardingSubmissionMutation();
  const [treatAsNew, { isLoading: isTreatingAsNew }] = useTreatOnboardingSubmissionAsNewMutation();
  const [flag, { isLoading: isFlagging }] = useFlagOnboardingSubmissionMutation();

  const isActing = isApproving || isReactivating || isTreatingAsNew || isFlagging;

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
          const message = result.message || "Submission pushed to PeopleVine.";
          if (result.data.submission.pvMembershipCardId) {
            toast.success(message);
          } else {
            toast.warning(message);
          }
          break;
        }
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
      <div className="flex items-center justify-between">
        <div>
          <nav className="text-sm text-gray-500 mb-2">
            <Link to="/dashboard" className="hover:text-gray-700 cursor-pointer">Home</Link>
            <span className="mx-1">›</span>
            <span className="font-semibold text-gray-900">Onboarding</span>
          </nav>
          <h1 className="text-2xl font-bold">Onboarding</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
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
                  {activeTab === "pending_review" ? "No submissions pending review" : "No duplicates flagged"}
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
                      submission.formData.membershipPackage || "—"
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => setConfirm({ type: "approve", submission })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
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

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {confirm.type === "approve" && "Approve and push to PeopleVine?"}
                  {confirm.type === "reactivate" && "Reactivate the existing record?"}
                  {confirm.type === "treat_as_new" && "Treat as a genuinely new customer?"}
                  {confirm.type === "flag" && "Flag for manual cleanup?"}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {confirm.type === "approve" &&
                    "This performs a real write to PeopleVine (register, add package, checkout, attach company)."}
                  {confirm.type === "reactivate" &&
                    "Flips the matched company/user back to active locally. Does not resurrect a cancelled PeopleVine subscription."}
                  {confirm.type === "treat_as_new" &&
                    "Moves this submission to Pending Review, ignoring the email match found."}
                  {confirm.type === "flag" &&
                    "Marks this submission for manual review — no automatic action is taken."}
                </p>
              </div>
            </div>

            {confirm.type === "flag" && (
              <Textarea
                placeholder="Optional note for whoever cleans this up…"
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
    </div>
  );
}
