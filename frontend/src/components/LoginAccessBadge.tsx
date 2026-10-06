import { Badge } from "@/components/ui/badge"
import type { LoginAccess } from "../../../common/access"

const STYLES: Record<LoginAccess, { label: string; className: string }> = {
  allowed: { label: "Allowed", className: "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" },
  blocked: { label: "Blocked", className: "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-50" },
  onboarding: { label: "Onboarding", className: "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-50" },
  admin: { label: "Admin", className: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100" },
}

export function LoginAccessBadge({ access }: { access: LoginAccess }) {
  const { label, className } = STYLES[access]
  return <Badge variant="outline" className={className}>{label}</Badge>
}
