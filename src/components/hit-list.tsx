import type { ConflictHit, Level } from "@/lib/conflicts/check";

const LEVEL: Record<Level, { label: string; box: string; chip: string }> = {
  conflict: { label: "Possible conflict", box: "border-[#f3cfc9] bg-gradient-to-br from-surface from-40% to-flag-tint", chip: "bg-flag text-white" },
  review: { label: "Needs review", box: "border-[#f6d3b8] bg-gradient-to-br from-surface from-40% to-amber-tint", chip: "bg-amber text-white" },
  info: { label: "For information", box: "border-line bg-surface", chip: "bg-stone text-[#565d5a]" },
};

const SUBJECT_ROLE = { prospect: "Prospective client", adverse: "Other side", related: "Also involved" };
const PARTY_ROLE = { client: "Client", opposing: "Opposing party", related: "Related party" };
const STRENGTH = { strong: "Strong match", probable: "Probable match", weak: "Weak match" };

/**
 * Conflict search results. Each row puts the name from the inquiry next to the
 * name on file, says why the two were matched, and what the pairing means.
 * `searched` says where the first name came from: an inquiry, or a search someone typed.
 */
export function HitList({ hits, searched = "In this inquiry" }: { hits: ConflictHit[]; searched?: string }) {
  if (!hits.length) return null;
  return (
    <ul className="space-y-4">
      {hits.map((hit, i) => {
        const level = LEVEL[hit.level];
        const quiet = hit.level === "info";
        return (
          <li key={i} className={`rounded-2xl border ${level.box}`}>
            <div className={quiet ? "px-4 py-3" : "px-5 py-4"}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className={`tag ${level.chip}`}>{level.label}</span>
                <span className="text-[0.9375rem] font-semibold">
                  {STRENGTH[hit.strength]}, {Math.round(hit.score * 100)}%
                </span>
              </div>

              <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                <div className="rounded-[0.875rem] border border-line bg-surface px-4 py-3.5 shadow-rest">
                  <p className="text-[0.9375rem] text-muted">{searched}: {SUBJECT_ROLE[hit.subject.role].toLowerCase()}</p>
                  <p className={`font-serif leading-snug ${quiet ? "text-lg" : "text-2xl font-normal"}`}>{hit.subject.name}</p>
                </div>
                <p className="self-center text-[0.9375rem] font-serif italic text-muted sm:text-center">matches</p>
                <div className="rounded-[0.875rem] border border-line bg-surface px-4 py-3.5 shadow-rest">
                  <p className="text-[0.9375rem] text-muted">
                    On file: {PARTY_ROLE[hit.partyRole].toLowerCase()}, {hit.matterStatus} matter
                  </p>
                  <p className={`font-serif leading-snug ${quiet ? "text-lg" : "text-2xl font-normal"}`}>{hit.partyName}</p>
                  {hit.viaAlias && <p className="text-[0.9375rem] text-muted">Also known as {hit.matchedName}</p>}
                </div>
              </div>

              <p className="mt-4 max-w-[70ch] font-semibold leading-relaxed">{hit.relationship}</p>
              <div className="mt-2 text-[0.9375rem] leading-relaxed">
                <p className="eyebrow">Why these were matched</p>
                <ul className="list-disc pl-5">
                  {hit.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
