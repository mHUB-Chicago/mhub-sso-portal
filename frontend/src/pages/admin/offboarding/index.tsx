import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Search, Building2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetOffboardingsQuery, type OffboardingRecord } from "@/store/api/offboardingApi";
import { OffboardingProgressModal } from "./OffboardingProgressModal";
import { OFFBOARDING_STEPS, offboardingStepState } from "./steps";
import { OffboardingViaPill } from "./pills";

type TabKey = "in_process" | "completed";

const matches = (record: OffboardingRecord, query: string) =>
  !query || [record.name, record.email].some((field) => field.toLowerCase().includes(query));

const typeCell = (record: OffboardingRecord) => (
  <span className="inline-flex items-center gap-1.5">
    {record.type === "company" ? (
      <Building2 className="h-3.5 w-3.5 text-gray-400" />
    ) : (
      <UserIcon className="h-3.5 w-3.5 text-gray-400" />
    )}
    {record.type === "company" ? "Company" : "Person"}
  </span>
);

const emailCell = (record: OffboardingRecord) =>
  record.type === "company" && record.members.length > 0
    ? `${record.members.length} member${record.members.length === 1 ? "" : "s"} affected`
    : record.email || "—";

function ProgressCell({ record }: { record: OffboardingRecord }) {
  const states = OFFBOARDING_STEPS.map((s) => offboardingStepState(record, s.key));
  const doneLabels = OFFBOARDING_STEPS.filter((_, idx) => states[idx] === "done").map((s) => s.label);
  const accessActive = states[0] === "warn";
  const label = accessActive ? "Access still active" : doneLabels.length ? doneLabels[doneLabels.length - 1] : "Not Started";
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`text-xs ${accessActive ? "font-bold text-red-600" : "text-gray-600"}`}>{label}</span>
      <span className="flex gap-1">
        {states.map((state, idx) => (
          <span
            key={OFFBOARDING_STEPS[idx].key}
            className={`h-2 w-2 rounded-full ${
              state === "done" ? "bg-green-500" : state === "warn" ? "bg-red-500" : state === "cur" ? "bg-brand" : "bg-gray-200"
            }`}
          />
        ))}
      </span>
    </div>
  );
}

export function AdminOffboardingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("in_process");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OffboardingRecord | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useGetOffboardingsQuery();
  const inProcess = data?.data?.inProcess ?? [];
  const completed = data?.data?.completed ?? [];
  const query = search.trim().toLowerCase();
  const rows = (activeTab === "in_process" ? inProcess : completed).filter((r) => matches(r, query));

  const tabs: { key: TabKey; label: string; badge: number }[] = [
    { key: "in_process", label: "In Process", badge: inProcess.length },
    { key: "completed", label: "Completed", badge: 0 },
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
          <p className="text-red-500 mb-2">Failed to load offboardings</p>
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
            <span className="font-semibold text-gray-900">Offboarding</span>
          </nav>
          <h1 className="text-2xl font-bold">Offboarding</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Offboarding tabs">
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{activeTab === "in_process" ? "Added" : "Completed"}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">PV ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Initiated By</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                {activeTab === "in_process" ? "Progress" : "Confirmed By"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {query
                    ? "No matches found"
                    : activeTab === "in_process"
                      ? "No offboardings in process."
                      : "No completed offboardings yet."}
                </td>
              </tr>
            ) : (
              rows.map((record) => (
                <tr
                  key={record.id}
                  className="hover:bg-orange-50/40 cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={`View offboarding progress for ${record.name}`}
                  onClick={() => setSelected(record)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(record);
                    }
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {new Date(activeTab === "in_process" ? record.createdAt : record.completedAt!).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{typeCell(record)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{record.name || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{emailCell(record)}</td>
                  <td className="px-4 py-3 text-gray-700">{record.peopleVineId || "—"}</td>
                  <td className="px-4 py-3">
                    <OffboardingViaPill via={record.via} />
                  </td>
                  <td className="px-4 py-3">
                    {activeTab === "in_process" ? (
                      <ProgressCell record={record} />
                    ) : (
                      <span className="text-gray-700">{record.completedByName || "—"}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <OffboardingProgressModal key={selected.id} record={selected} open={!!selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
