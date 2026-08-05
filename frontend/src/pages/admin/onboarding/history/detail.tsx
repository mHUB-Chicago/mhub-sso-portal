import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetOnboardingSubmissionByIdQuery } from "@/store/api/onboardingApi";
import type { ReactNode } from "react";

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

  const { company, user, skills, billing, membershipPackage } = submission.formData;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-4">
      <Button variant="ghost" onClick={() => navigate("/admin/onboarding")} className="mb-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Onboarding
      </Button>

      <div>
        <p className="text-xs text-gray-400">Home / Onboarding</p>
        <h1 className="text-2xl font-bold">{company.name || "Untitled Company"}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Submitted {new Date(submission.createdAt).toLocaleString()}
        </p>
      </div>

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
        <Field label="Membership Package" value={membershipPackage} />
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

      <Link to="/admin/onboarding" className="text-sm text-gray-500 hover:text-gray-700">
        Back to all submissions
      </Link>
    </div>
  );
}
