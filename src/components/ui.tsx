import type { LeadStatus } from "@/db/schema";
import type { ConflictOutcome } from "@/lib/conflicts/check";
import { TIER_LABEL } from "@/lib/scoring";

/** A stage is written out in words. The mark beside it fills in as the inquiry moves along. */
const STATUS: Record<LeadStatus, { label: string; mark: string; text: string }> = {
  new: { label: "New", mark: "border-2 border-ink", text: "text-ink" },
  cleared: { label: "Cleared", mark: "border-2 border-plum bg-rose-pale", text: "text-ink" },
  flagged: { label: "Held for review", mark: "rounded-none bg-amber", text: "text-amber" },
  declined: { label: "Declined", mark: "bg-[#8d8698]", text: "text-muted" },
  letter_sent: { label: "Awaiting signature", mark: "border-2 border-plum bg-[linear-gradient(90deg,var(--color-plum)_50%,transparent_50%)]", text: "text-ink" },
  signed: { label: "Signed", mark: "bg-plum", text: "text-plum" },
};

export function StatusChip({ status }: { status: LeadStatus }) {
  const { label, mark, text } = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${text}`}>
      <span aria-hidden className={`size-3 shrink-0 rounded-full ${mark}`} />
      {label}
    </span>
  );
}

const OUTCOME: Record<ConflictOutcome, { label: string; className: string }> = {
  conflict: { label: "Possible conflict", className: "bg-flag text-white" },
  review: { label: "Needs review", className: "bg-amber-tint text-amber shadow-[inset_0_0_0_1.5px_var(--color-amber)]" },
  clear: { label: "Nothing found", className: "bg-rose-tint text-plum-deep shadow-[inset_0_0_0_1.5px_var(--color-plum)]" },
};

export function OutcomeChip({ outcome }: { outcome: ConflictOutcome }) {
  const { label, className } = OUTCOME[outcome];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2.5 py-1 text-[0.9375rem] font-semibold leading-tight ${className}`}>{label}</span>;
}

/** The intake score: the number in the display face, with the fit written beside it. */
export function Score({ value, tier, size = "sm" }: { value: number; tier: "hot" | "warm" | "cool"; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
      <span className={`font-serif font-semibold tabular-nums ${size === "lg" ? "text-5xl text-plum" : "text-[1.375rem]"}`}>{value}</span>
      <span className="text-[0.9375rem] text-muted">{TIER_LABEL[tier]}</span>
    </span>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-serif text-[2.5rem] font-medium leading-tight tracking-[-0.015em]">{title}</h1>
      {children && <p className="mt-2 max-w-[72ch] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
