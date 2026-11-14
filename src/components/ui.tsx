import type { LeadStatus } from "@/db/schema";
import type { ConflictOutcome } from "@/lib/conflicts/check";
import { TIER_LABEL } from "@/lib/scoring";

const STATUS: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: "New", className: "border-ink/30 bg-surface text-ink" },
  cleared: { label: "Cleared", className: "border-juniper/30 bg-juniper-tint text-juniper-deep" },
  flagged: { label: "Held for review", className: "border-amber/30 bg-amber-tint text-amber" },
  declined: { label: "Declined", className: "border-line bg-paper text-muted" },
  letter_sent: { label: "Awaiting signature", className: "border-brass/30 bg-brass-tint text-brass" },
  signed: { label: "Signed", className: "border-juniper bg-juniper text-white" },
};

export function StatusChip({ status }: { status: LeadStatus }) {
  const { label, className } = STATUS[status];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-semibold ${className}`}>{label}</span>;
}

const OUTCOME: Record<ConflictOutcome, { label: string; className: string }> = {
  conflict: { label: "Possible conflict", className: "bg-flag text-white" },
  review: { label: "Needs review", className: "bg-amber-tint text-amber border border-amber/30" },
  clear: { label: "Nothing found", className: "bg-juniper-tint text-juniper-deep border border-juniper/30" },
};

export function OutcomeChip({ outcome }: { outcome: ConflictOutcome }) {
  const { label, className } = OUTCOME[outcome];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold ${className}`}>{label}</span>;
}

const TIER = TIER_LABEL;

/** The lead score as a number in brass, the one place that colour is used for data. */
export function Score({ value, tier, size = "sm" }: { value: number; tier: "hot" | "warm" | "cool"; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={`font-serif font-semibold tabular-nums text-brass ${size === "lg" ? "text-4xl" : "text-xl"}`}>{value}</span>
      <span className="text-[0.8125rem] text-muted">{TIER[tier]}</span>
    </span>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="font-serif text-3xl leading-tight">{title}</h1>
      {children && <p className="mt-2 max-w-[70ch] text-[0.9375rem] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
