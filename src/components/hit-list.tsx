import type { ConflictHit, Level } from "@/lib/conflicts/check";

const LEVEL: Record<Level, { label: string; bar: string; text: string }> = {
  conflict: { label: "Possible conflict", bar: "bg-flag", text: "text-flag" },
  review: { label: "Needs review", bar: "bg-amber", text: "text-amber" },
  info: { label: "For information", bar: "bg-line", text: "text-muted" },
};

const SUBJECT_ROLE = { prospect: "Prospective client", adverse: "Other side", related: "Also involved" };
const PARTY_ROLE = { client: "Client", opposing: "Opposing party", related: "Related party" };
const STRENGTH = { strong: "Strong match", probable: "Probable match", weak: "Weak match" };

/**
 * Conflict search results. Each row puts the name from the inquiry next to the
 * name on file, says why the two were matched, and what the pairing means.
 */
export function HitList({ hits }: { hits: ConflictHit[] }) {
  if (!hits.length) return null;
  return (
    <ul className="space-y-3">
      {hits.map((hit, i) => {
        const level = LEVEL[hit.level];
        return (
          <li key={i} className="relative overflow-hidden rounded-lg border border-line bg-surface pl-1.5">
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${level.bar}`} />
            <div className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className={`text-sm font-semibold ${level.text}`}>{level.label}</span>
                <span className="text-[0.8125rem] text-muted">
                  {STRENGTH[hit.strength]}, {Math.round(hit.score * 100)}%
                </span>
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div>
                  <p className="text-[0.8125rem] text-muted">In this inquiry: {SUBJECT_ROLE[hit.subject.role].toLowerCase()}</p>
                  <p className="font-serif text-xl leading-snug">{hit.subject.name}</p>
                </div>
                <p className="text-sm text-muted sm:text-center">matches</p>
                <div>
                  <p className="text-[0.8125rem] text-muted">
                    On file: {PARTY_ROLE[hit.partyRole].toLowerCase()}, {hit.matterStatus} matter
                  </p>
                  <p className="font-serif text-xl leading-snug">{hit.partyName}</p>
                  {hit.viaAlias && <p className="text-[0.8125rem] text-muted">Also known as {hit.matchedName}</p>}
                </div>
              </div>

              <p className="mt-3 text-[0.9375rem] leading-relaxed">{hit.relationship}</p>
              <div className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
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
