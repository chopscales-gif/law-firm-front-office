import type { LeadStatus } from "@/db/schema";
import type { ConflictOutcome } from "@/lib/conflicts/check";
import { TIER_LABEL } from "@/lib/scoring";

/**
 * Each stage has its own colour, used wherever the stage is named: needs the firm (lake),
 * held (amber), go-ahead and done (green), waiting on the client (plum), closed off (grey).
 */
export const STAGE: Record<LeadStatus, { label: string; chip: string; bar: string }> = {
  new: { label: "New", chip: "bg-lake text-white", bar: "bg-lake" },
  flagged: { label: "Held for review", chip: "bg-amber text-white", bar: "bg-amber" },
  cleared: { label: "Cleared", chip: "bg-green-tint text-green shadow-[inset_0_0_0_1.5px_var(--color-green)]", bar: "bg-[#5aa784]" },
  letter_sent: { label: "Awaiting signature", chip: "bg-plum text-white", bar: "bg-plum" },
  signed: { label: "Signed", chip: "bg-green text-white", bar: "bg-green" },
  declined: { label: "Declined", chip: "bg-[#c9d2d6] text-ink", bar: "bg-[#7c888e]" },
};

export function StatusChip({ status, size = "sm" }: { status: LeadStatus; size?: "sm" | "lg" }) {
  const { label, chip } = STAGE[status];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-bold leading-tight ${size === "lg" ? "px-4 py-2 text-base" : "px-3 py-1 text-[0.875rem]"} ${chip}`}>
      {label}
    </span>
  );
}

/** What a conflict check found, in the same three colours wherever it is shown. */
export const OUTCOME: Record<ConflictOutcome, { label: string; chip: string; box: string }> = {
  conflict: { label: "Possible conflict", chip: "bg-flag text-white", box: "border-flag bg-flag-tint" },
  review: { label: "Needs review", chip: "bg-amber text-white", box: "border-amber bg-amber-tint" },
  clear: { label: "Nothing found", chip: "bg-green text-white", box: "border-green bg-green-tint" },
};

export function OutcomeChip({ outcome }: { outcome: ConflictOutcome }) {
  const { label, chip } = OUTCOME[outcome];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[0.9375rem] font-bold leading-tight ${chip}`}>{label}</span>;
}

const TIER = { hot: "bg-petrol text-white", warm: "bg-lake-tint text-petrol shadow-[inset_0_0_0_1.5px_var(--color-lake)]", cool: "bg-[#c9d2d6] text-ink" };

/** The intake score: the number on a block coloured by how good the fit is, with the fit written beside it. */
export function Score({ value, tier, size = "sm" }: { value: number; tier: "hot" | "warm" | "cool"; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span
        className={`inline-flex items-center justify-center rounded font-serif font-semibold tabular-nums ${TIER[tier]} ${
          size === "lg" ? "h-14 min-w-[4.5rem] px-3 text-[2rem]" : "h-9 min-w-[3rem] px-2 text-lg"
        }`}
      >
        {value}
      </span>
      <span className={size === "lg" ? "font-semibold" : "text-[0.9375rem] font-semibold text-muted"}>{TIER_LABEL[tier]}</span>
    </span>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-serif text-[2.5rem] font-semibold leading-tight tracking-[-0.015em] text-petrol">{title}</h1>
      {children && <p className="mt-2 max-w-[72ch] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}
