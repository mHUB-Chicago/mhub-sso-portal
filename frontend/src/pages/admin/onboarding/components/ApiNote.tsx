import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiNoteProps {
  children: ReactNode;
  variant?: "limitation" | "info";
  className?: string;
}

export const ApiNote = ({ children, variant = "limitation", className }: ApiNoteProps) => {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-r-md border border-l-[3px] px-3.5 py-2.5 text-[11.5px]",
        variant === "limitation"
          ? "border-amber-200 border-l-amber-500 bg-amber-50 text-amber-900"
          : "border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-900",
        className
      )}
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
};
