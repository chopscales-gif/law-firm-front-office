import type { ConflictHit, Level } from "@/lib/conflicts/check";

const LEVEL: Record<Level, { label: string; bar: string; text: string }> = {
  conflict: { label: "Possible conflict", bar: "border-flag", text: "text-flag" },
  review: { label: "Needs review", bar: "border-amber", text: "text-amber" },
  info: { label: "For information", bar: "border-[#7c888e]", text: "text-muted" },
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
          <li key={i} className={`border-l-4 ${level.bar} ${quiet ? "" : "bg-surface"}`}>
            <div className={quiet ? "py-1 pl-4" : "px-5 py-4"}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className={`font-semibold ${level.text}`}>{level.label}</span>
                <span className="text-[0.9375rem] text-muted">
                  {STRENGTH[hit.strength]}, {Math.round(hit.score * 100)}%
                </span>
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                <div>
                  <p className="text-[0.9375rem] text-muted">{searched}: {SUBJECT_ROLE[hit.subject.role].toLowerCase()}</p>
                  <p className={`font-serif leading-snug ${quiet ? "text-lg" : "text-2xl font-medium"}`}>{hit.subject.name}</p>
                </div>
                <p className="text-[0.9375rem] italic text-muted sm:pt-7 sm:text-center">matches</p>
                <div>
                  <p className="text-[0.9375rem] text-muted">
                    On file: {PARTY_ROLE[hit.partyRole].toLowerCase()}, {hit.matterStatus} matter
                  </p>
                  <p className={`font-serif leading-snug ${quiet ? "text-lg" : "text-2xl font-medium"}`}>{hit.partyName}</p>
                  {hit.viaAlias && <p className="text-[0.9375rem] text-muted">Also known as {hit.matchedName}</p>}
                </div>
              </div>

              <p className="mt-3 max-w-[70ch] leading-relaxed">{hit.relationship}</p>
              <div className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                <p>Why these were matched</p>
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
