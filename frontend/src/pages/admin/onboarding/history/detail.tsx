import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useGetOnboardingMembershipPackagesQuery,
  useGetOnboardingSubmissionByIdQuery,
  useUpdateOnboardingSubmissionMutation,
  type OnboardingFormData,
} from "@/store/api/onboardingApi";
import { CompanyDetailsStep } from "../components/CompanyDetailsStep";
import { PrimaryUserStep } from "../components/PrimaryUserStep";
import { MembershipPackageStep } from "../components/MembershipPackageStep";
import { SkillsStep } from "../components/SkillsStep";
import type { ReactNode } from "react";
import type { Address, CompanyDetails, PrimaryUserDetails, SkillsDetails } from "../types";

const EDITABLE_STATUSES = new Set(["pending_review", "needs_attention"]);

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 break-words">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>
    </div>
  );
}

export function AdminOnboardingHistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useGetOnboardingSubmissionByIdQuery(id ?? "", { skip: !id });
  const [updateSubmission, { isLoading: isSaving }] = useUpdateOnboardingSubmissionMutation();
  const { data: packagesData } = useGetOnboardingMembershipPackagesQuery();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<OnboardingFormData | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const submission = data?.data?.submission;

  if (error || !submission) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Failed to load onboarding submission</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  const canEdit = EDITABLE_STATUSES.has(submission.status);
  const formData = isEditing && draft ? draft : submission.formData;
  const { company, user, skills, billing, membershipPackage } = formData;
  const membershipPackageName =
    packagesData?.data?.packages.find((pkg) => pkg.id === membershipPackage)?.name ?? membershipPackage;

  const startEditing = () => {
    setDraft(submission.formData);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(null);
    setIsEditing(false);
  };

  const updateCompanyField = (field: keyof CompanyDetails, fieldValue: string) => {
    setDraft((prev) => (prev ? { ...prev, company: { ...prev.company, [field]: fieldValue } } : prev));
  };

  const updateUserField = (field: keyof Omit<PrimaryUserDetails, "address">, fieldValue: string) => {
    setDraft((prev) => (prev ? { ...prev, user: { ...prev.user, [field]: fieldValue } } : prev));
  };

  const updateUserAddress = (field: keyof Address, fieldValue: string) => {
    setDraft((prev) =>
      prev ? { ...prev, user: { ...prev.user, address: { ...prev.user.address, [field]: fieldValue } } } : prev
    );
  };

  const updateMembershipPackage = (fieldValue: string) => {
    setDraft((prev) => (prev ? { ...prev, membershipPackage: fieldValue } : prev));
  };

  const updateSkillsField = (
    field: keyof Omit<SkillsDetails, "skills" | "shopSkills">,
    fieldValue: string
  ) => {
    setDraft((prev) => (prev ? { ...prev, skills: { ...prev.skills, [field]: fieldValue } } : prev));
  };

  const updateSkills = (skillsList: string[]) => {
    setDraft((prev) => (prev ? { ...prev, skills: { ...prev.skills, skills: skillsList } } : prev));
  };

  const updateShopSkills = (shopSkillsList: string[]) => {
    setDraft((prev) => (prev ? { ...prev, skills: { ...prev.skills, shopSkills: shopSkillsList } } : prev));
  };

  const updateBillingField = (field: "nameOnCard" | "cardLast4" | "expiration", fieldValue: string) => {
    setDraft((prev) => (prev ? { ...prev, billing: { ...prev.billing, [field]: fieldValue } } : prev));
  };

  const updateBillingAddress = (field: keyof Address, fieldValue: string) => {
    setDraft((prev) =>
      prev ? { ...prev, billing: { ...prev.billing, address: { ...prev.billing.address, [field]: fieldValue } } } : prev
    );
  };

  const handleSave = async () => {
    if (!draft || !id) return;
    try {
      await updateSubmission({ id, formData: draft }).unwrap();
      toast.success("Onboarding submission updated.");
      setIsEditing(false);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update submission.");
    }
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/admin/onboarding")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Button>

        {canEdit && !isEditing && (
          <Button variant="outline" onClick={startEditing}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={cancelEditing} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-brand hover:bg-brand-hover">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-400">Home / Onboarding</p>
        <h1 className="text-2xl font-bold">{company.name || "Untitled Company"}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submitted {new Date(submission.createdAt).toLocaleString()}
        </p>
      </div>

      {isEditing && draft ? (
        <>
          <div className="rounded-lg border p-5">
            <CompanyDetailsStep value={draft.company} onChange={updateCompanyField} />
          </div>

          <div className="rounded-lg border p-5">
            <PrimaryUserStep value={draft.user} onChange={updateUserField} onAddressChange={updateUserAddress} />
          </div>

          <div className="rounded-lg border p-5">
            <MembershipPackageStep value={draft.membershipPackage} onChange={updateMembershipPackage} />
          </div>

          <div className="rounded-lg border p-5">
            <SkillsStep
              value={draft.skills}
              onChange={updateSkillsField}
              onSkillsChange={updateSkills}
              onShopSkillsChange={updateShopSkills}
            />
          </div>

          <div className="rounded-lg border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Billing</h2>
            <p className="text-xs text-gray-500">
              Only the last 4 digits of the card are ever stored — re-enter the full card number in the
              onboarding form if it needs to change.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editNameOnCard">Name on Card</Label>
                <Input
                  id="editNameOnCard"
                  value={draft.billing.nameOnCard}
                  onChange={(e) => updateBillingField("nameOnCard", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="editCardLast4">Card Last 4</Label>
                <Input
                  id="editCardLast4"
                  maxLength={4}
                  value={draft.billing.cardLast4 ?? ""}
                  onChange={(e) => updateBillingField("cardLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="editExpiration">Expiration</Label>
                <Input
                  id="editExpiration"
                  placeholder="MM/YY"
                  value={draft.billing.expiration}
                  onChange={(e) => updateBillingField("expiration", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Billing Address</Label>
              <Input
                placeholder="Street address"
                value={draft.billing.address.street}
                onChange={(e) => updateBillingAddress("street", e.target.value)}
              />
              <div className="grid grid-cols-3 gap-4">
                <Input
                  placeholder="City"
                  value={draft.billing.address.city}
                  onChange={(e) => updateBillingAddress("city", e.target.value)}
                />
                <Input
                  placeholder="State"
                  value={draft.billing.address.state}
                  onChange={(e) => updateBillingAddress("state", e.target.value)}
                />
                <Input
                  placeholder="Zip / Postal"
                  value={draft.billing.address.zip}
                  onChange={(e) => updateBillingAddress("zip", e.target.value)}
                />
              </div>
              <Input
                placeholder="Country"
                value={draft.billing.address.country}
                onChange={(e) => updateBillingAddress("country", e.target.value)}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <Section title="Company Details">
            <Field label="Name" value={company.name} />
            <Field label="Website" value={company.website} />
            <Field label="Size" value={company.size} />
            <Field label="Founded" value={company.founded} />
            <Field label="Industry" value={company.industry} />
            <Field label="Incorporation" value={company.incorporation} />
            <Field label="Funding Stage" value={company.fundingStage} />
            <Field label="Problem" value={company.problem} />
            <Field label="Target Market" value={company.targetMarket} />
          </Section>

          <Section title="Primary User">
            <Field label="Name" value={[user.firstName, user.lastName].filter(Boolean).join(" ")} />
            <Field label="Title" value={user.title} />
            <Field label="Email" value={user.email} />
            <Field
              label="Phone"
              value={user.phone ? `+${user.phoneCountryCode || "?"} ${user.phone}` : undefined}
            />
            <Field label="Birthday" value={user.birthday} />
            <Field label="LinkedIn" value={user.linkedin} />
            <Field label="Gender" value={user.gender} />
            <Field label="Pronouns" value={user.pronouns} />
            <Field label="Ethnicity" value={user.ethnicity} />
            <Field
              label="Address"
              value={[user.address.street, user.address.city, user.address.state, user.address.zip, user.address.country]
                .filter(Boolean)
                .join(", ")}
            />
          </Section>

          <Section title="Membership & Skills">
            <Field label="Membership Package" value={membershipPackageName} />
            <Field label="Undergrad" value={[skills.undergradSchool, skills.undergradDegree].filter(Boolean).join(" — ")} />
            <Field label="Graduate" value={[skills.gradSchool, skills.gradDegree].filter(Boolean).join(" — ")} />
            <Field label="Industry Experience" value={skills.industryExperience} />
            <Field label="Skills" value={skills.skills.join(", ")} />
            <Field label="Shop Skills" value={skills.shopSkills.join(", ")} />
          </Section>

          <Section title="Billing">
            <Field label="Payment Type" value={billing.paymentType} />
            <Field label="Name on Card" value={billing.paymentType === "card" ? billing.nameOnCard : undefined} />
            <Field label="Card" value={billing.cardLast4 ? `•••• ${billing.cardLast4}` : undefined} />
            <Field label="Expiration" value={billing.paymentType === "card" ? billing.expiration : undefined} />
            <Field
              label="Billing Address"
              value={[billing.address.street, billing.address.city, billing.address.state, billing.address.zip, billing.address.country]
                .filter(Boolean)
                .join(", ")}
            />
          </Section>
        </>
      )}

      <Link to="/admin/onboarding" className="text-sm text-gray-500 hover:text-gray-700">
        Back to all submissions
      </Link>
    </div>
  );
}
