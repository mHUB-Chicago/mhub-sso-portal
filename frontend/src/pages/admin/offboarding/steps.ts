import type { OffboardingRecord } from "@/store/api/offboardingApi";

type StepKey = "access" | "pv" | "confirm";
type StepState = "done" | "warn" | "cur" | "pend";

export const OFFBOARDING_STEPS: { key: StepKey; label: string; waiting: string }[] = [
  { key: "access", label: "SSO Access Removed", waiting: "The member can still sign in. Remove their SSO access." },
  {
    key: "pv",
    label: "Membership Removed in PV",
    waiting: "Waiting on an admin to remove the membership and subscription in PeopleVine. Recorded automatically via webhook.",
  },
  { key: "confirm", label: "Offboarding Confirmed", waiting: "Review the record and confirm the offboarding is complete." },
];

export const stepDate = (record: OffboardingRecord, key: StepKey): string | null =>
  key === "access" ? record.accessRemovedAt : key === "pv" ? record.pvRemovedAt : record.completedAt;

export const offboardingStepState = (record: OffboardingRecord, key: StepKey): StepState => {
  if (stepDate(record, key)) return "done";
  if (key === "access") return "warn";
  if (key === "pv") return "cur";
  return record.accessRemovedAt && record.pvRemovedAt ? "cur" : "pend";
};
