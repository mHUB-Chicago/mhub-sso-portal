export function OffboardingViaPill({ via }: { via: "admin" | "member" }) {
  return (
    <span
      className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap ${
        via === "admin" ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-600"
      }`}
    >
      {via === "admin" ? "Admin Offboard" : "Member Cancelled"}
    </span>
  );
}

export function MemberSourcePill({ memberSource }: { memberSource: string }) {
  const isInherited = memberSource === "membership";
  return (
    <span
      className={`text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${
        isInherited ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-700"
      }`}
    >
      {isInherited ? "Inherited" : "Subscription holder"}
    </span>
  );
}

export function OffboardingBadge() {
  return (
    <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-red-50 text-red-600">
      Offboarding
    </span>
  );
}
