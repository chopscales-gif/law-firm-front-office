import type { LeadStatus } from "@/db/schema";
import type { ConflictOutcome } from "@/lib/conflicts/check";
import { TIER_LABEL } from "@/lib/scoring";

/**
 * Each stage has its own tint, used wherever the stage is named: just arrived (sky), held (peach),
 * go-ahead (mint), waiting on the client (lilac), done (the firm's solid green), closed off (grey).
 */
export const STAGE: Record<LeadStatus, { label: string; chip: string; dot: string }> = {
  new: { label: "New", chip: "bg-sky-tint text-sky", dot: "bg-sky" },
  flagged: { label: "Held for review", chip: "bg-amber-tint text-amber", dot: "bg-[#e08a3c]" },
  cleared: { label: "Cleared", chip: "bg-green-tint text-green", dot: "bg-[#2fa58a]" },
  letter_sent: { label: "Awaiting signature", chip: "bg-plum-tint text-plum", dot: "bg-[#8a72cf]" },
  signed: { label: "Signed", chip: "bg-forest text-white", dot: "bg-forest" },
  declined: { label: "Declined", chip: "bg-stone text-[#565d5a]", dot: "bg-[#b3b8b3]" },
};

export function StatusChip({ status, size = "sm" }: { status: LeadStatus; size?: "sm" | "lg" }) {
  const { label, chip } = STAGE[status];
  return <span className={`tag ${size === "lg" ? "!px-4 !py-1.5 !text-[0.9375rem]" : ""} ${chip}`}>{label}</span>;
}

/** What a conflict check found, in the same three colours wherever it is shown. */
export const OUTCOME: Record<ConflictOutcome, { label: string; chip: string; box: string }> = {
  conflict: { label: "Possible conflict", chip: "bg-flag text-white", box: "border-[#f3cfc9] bg-flag-tint" },
  review: { label: "Needs review", chip: "bg-amber text-white", box: "border-[#f6d3b8] bg-amber-tint" },
  clear: { label: "Nothing found", chip: "bg-green text-white", box: "border-[#bfe6dc] bg-green-tint" },
};

export function OutcomeChip({ outcome }: { outcome: ConflictOutcome }) {
  const { label, chip } = OUTCOME[outcome];
  return <span className={`tag ${chip}`}>{label}</span>;
}

const TIER = { hot: "text-ink", warm: "text-ink", cool: "text-faint" };

/** The intake score: the number set large in the serif, with the fit written beside it. */
export function Score({ value, tier, size = "sm" }: { value: number; tier: "hot" | "warm" | "cool"; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex items-baseline gap-2.5 whitespace-nowrap">
      <span className={`figure ${TIER[tier]} ${size === "lg" ? "text-[3.25rem]" : "text-[2.125rem]"}`}>{value}</span>
      <span className={size === "lg" ? "font-medium" : "text-[0.9375rem] text-muted"}>{TIER_LABEL[tier]}</span>
    </span>
  );
}

/** How a firm-side page opens: an optional small label, a light headline whose `accent` is set in the serif, then one line of help. */
export function PageHeader({ title, accent, label, children }: { title: string; accent?: string; label?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-[clamp(1.5rem,3vw,2.5rem)] mt-2 grid max-w-[60rem] gap-3.5">
      {label && <p className="eyebrow">{label}</p>}
      <h1 className="display text-[clamp(2.125rem,4.2vw,3.5rem)] [overflow-wrap:anywhere]">
        {title} {accent && <span className="accent">{accent}</span>}
      </h1>
      {children && <p className="max-w-[62ch] text-lg text-muted">{children}</p>}
    </div>
  );
}
