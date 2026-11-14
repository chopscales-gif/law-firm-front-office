import { compareNames, type MatchBasis } from "./compare";
import { normalizeEmail, normalizePhone } from "./normalize";

/** Someone already in the firm's files: a client, an opposing party, or anyone else named on a matter. */
export type PartyRecord = {
  id: string;
  name: string;
  /** Former names, maiden names, trade names. */
  aliases: string[];
  kind: "person" | "organization";
  role: "client" | "opposing" | "related";
  email: string | null;
  phone: string | null;
  matterId: string;
  matterName: string;
  matterStatus: "open" | "closed";
};

/** A name from the new inquiry that needs checking. */
export type Subject = {
  name: string;
  /** How this person relates to the new inquiry. */
  role: "prospect" | "adverse" | "related";
  kind?: "person" | "organization";
  email?: string | null;
  phone?: string | null;
};

export type Strength = "strong" | "probable" | "weak";
export type Level = "conflict" | "review" | "info";

export type ConflictHit = {
  subject: { name: string; role: Subject["role"] };
  partyId: string;
  partyName: string;
  partyRole: PartyRecord["role"];
  /** The name on file that actually matched; differs from partyName when an alias matched. */
  matchedName: string;
  viaAlias: boolean;
  matterId: string;
  matterName: string;
  matterStatus: PartyRecord["matterStatus"];
  score: number;
  strength: Strength;
  basis: MatchBasis;
  reasons: string[];
  level: Level;
  /** One sentence on why this relationship matters. */
  relationship: string;
};

export type ConflictOutcome = "conflict" | "review" | "clear";

export type ConflictResult = {
  outcome: ConflictOutcome;
  summary: string;
  hits: ConflictHit[];
  /** How many names on file were searched, for the audit record. */
  partiesSearched: number;
};

export const STRONG = 0.9;
export const PROBABLE = 0.75;
export const WEAK = 0.4;

function strengthOf(score: number): Strength {
  if (score >= STRONG) return "strong";
  if (score >= PROBABLE) return "probable";
  return "weak";
}

/**
 * What the pairing of roles means for the firm. These flag items for a lawyer to
 * assess; whether a conflict actually exists is the lawyer's call.
 */
function assess(subjectRole: Subject["role"], party: PartyRecord, strength: Strength): { level: Level; relationship: string } {
  const matter = `${party.matterName} (${party.matterStatus})`;
  const { level } = assessRoles(subjectRole, party, matter);
  // A weak match is usually a different person, so it is never described as if it were the same one.
  if (strength === "weak") {
    const who = subjectRole === "prospect" ? "The prospect" : subjectRole === "adverse" ? "The other side" : "This person";
    const onFile = party.role === "client" ? "a client" : party.role === "opposing" ? "the opposing party" : "a related party";
    return { level, relationship: `${who} shares only part of a name with ${party.name}, ${onFile} in ${matter}. Could be a relative, or no connection.` };
  }
  return assessRoles(subjectRole, party, matter);
}

function assessRoles(subjectRole: Subject["role"], party: PartyRecord, matter: string): { level: Level; relationship: string } {
  if (subjectRole === "prospect") {
    if (party.role === "opposing") {
      return party.matterStatus === "open"
        ? { level: "conflict", relationship: `The prospect is the opposing party in ${matter}. The firm is acting against them now.` }
        : { level: "review", relationship: `The prospect was the opposing party in ${matter}. The firm acted against them.` };
    }
    if (party.role === "client") {
      return {
        level: "info",
        relationship: party.matterStatus === "open"
          ? `The prospect is already a client in ${matter}.`
          : `The prospect is a former client from ${matter}.`,
      };
    }
    return { level: "review", relationship: `The prospect is named as a related party in ${matter}.` };
  }

  if (subjectRole === "adverse") {
    if (party.role === "client") {
      return party.matterStatus === "open"
        ? { level: "conflict", relationship: `The other side is a current client of the firm in ${matter}.` }
        : { level: "review", relationship: `The other side is a former client from ${matter}. Duties to former clients may apply.` };
    }
    if (party.role === "opposing") {
      return { level: "info", relationship: `The other side was also the opposing party in ${matter}. No conflict by itself.` };
    }
    return { level: "review", relationship: `The other side is named as a related party in ${matter}.` };
  }

  if (party.role === "client") {
    return { level: "review", relationship: `Someone connected to this inquiry is a client in ${matter}.` };
  }
  return { level: "info", relationship: `Someone connected to this inquiry is also named in ${matter}.` };
}

const LEVEL_ORDER: Record<Level, number> = { conflict: 0, review: 1, info: 2 };

/**
 * Searches every party on file for each name in the inquiry.
 * Pure function: no database, no clock, so it is fully covered by unit tests.
 */
export function runConflictCheck(subjects: Subject[], parties: PartyRecord[]): ConflictResult {
  const hits: ConflictHit[] = [];

  for (const subject of subjects) {
    const subjectName = subject.name.trim();
    if (!subjectName) continue;
    const subjectEmail = normalizeEmail(subject.email);
    const subjectPhone = normalizePhone(subject.phone);

    for (const party of parties) {
      let best: { score: number; basis: MatchBasis; reasons: string[]; matchedName: string; viaAlias: boolean } | null = null;

      const candidates = [party.name, ...party.aliases];
      candidates.forEach((candidate, index) => {
        const asGiven = compareNames(subjectName, candidate, { a: subject.kind });
        // A bare name typed into the search ("WRPM") may be a business: against a business on file, read it both ways.
        const asBusiness = !subject.kind && party.kind === "organization" ? compareNames(subjectName, candidate, { a: "organization" }) : null;
        const comparison = asBusiness && asBusiness.score > (asGiven?.score ?? 0) ? asBusiness : asGiven;
        if (!comparison) return;
        const viaAlias = index > 0;
        if (!best || comparison.score > best.score) {
          best = {
            score: comparison.score,
            basis: comparison.basis,
            reasons: viaAlias
              ? [`Matched a former or alternate name on file: "${candidate}"`, ...comparison.reasons.filter((r) => r !== "Same name")]
              : comparison.reasons,
            matchedName: candidate,
            viaAlias,
          };
        }
      });

      // Contact details identify a person even when the name is written differently.
      const sameEmail = subjectEmail !== null && subjectEmail === normalizeEmail(party.email);
      const samePhone = subjectPhone !== null && subjectPhone === normalizePhone(party.phone);
      if (sameEmail || samePhone) {
        const contactReason = sameEmail ? "Same email address as the party on file" : "Same phone number as the party on file";
        const current = best as { score: number; reasons: string[] } | null;
        best = {
          score: Math.max(current?.score ?? 0, sameEmail ? 0.98 : 0.95),
          basis: sameEmail ? "email" : "phone",
          reasons: [contactReason, ...(current?.reasons.filter((r) => r !== "Same name") ?? [])],
          matchedName: party.name,
          viaAlias: false,
        };
      }

      const found = best as { score: number; basis: MatchBasis; reasons: string[]; matchedName: string; viaAlias: boolean } | null;
      if (!found || found.score < WEAK) continue;

      const { level, relationship } = assess(subject.role, party, strengthOf(found.score));
      hits.push({
        subject: { name: subjectName, role: subject.role },
        partyId: party.id,
        partyName: party.name,
        partyRole: party.role,
        matchedName: found.matchedName,
        viaAlias: found.viaAlias,
        matterId: party.matterId,
        matterName: party.matterName,
        matterStatus: party.matterStatus,
        score: Math.round(found.score * 100) / 100,
        strength: strengthOf(found.score),
        basis: found.basis,
        reasons: found.reasons,
        level,
        relationship,
      });
    }
  }

  hits.sort((x, y) => {
    const xWeak = x.strength === "weak" ? 1 : 0;
    const yWeak = y.strength === "weak" ? 1 : 0;
    return xWeak - yWeak || LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level] || y.score - x.score;
  });

  // Weak name matches are listed for completeness but never decide the outcome, with one
  // exception: when only part of a name was given ("Reyes"), every match on it is weak by
  // construction, so a person has to look before the check can be called clear.
  const solid = hits.filter((h) => h.strength !== "weak");
  const weakCount = hits.length - solid.length;
  const partial = subjects
    .map((s) => s.name.trim())
    .filter((name) => name && !/\s/.test(name) && hits.some((h) => h.subject.name === name && h.level !== "info"));
  let outcome: ConflictOutcome = "clear";
  if (solid.some((h) => h.level === "conflict")) outcome = "conflict";
  else if (solid.some((h) => h.level === "review") || partial.length) outcome = "review";

  const weakNote = weakCount ? ` ${weakCount} weak name ${weakCount === 1 ? "match is" : "matches are"} listed for completeness.` : "";
  const summary =
    outcome === "conflict"
      ? "A likely conflict was found. An attorney must review before the firm goes further."
      : outcome === "review"
        ? partial.length && !solid.some((h) => h.level === "review")
          ? `Only part of a name was given ("${partial[0]}"), and it partly matches names on file. Get the full name, or have an attorney look at the matches.`
          : "No direct conflict found, but there are connections an attorney should look at."
        : solid.length
          ? `No conflicts found. ${solid.length} existing ${solid.length === 1 ? "relationship is" : "relationships are"} noted.${weakNote}`
          : weakCount
            ? `No close matches among ${parties.length} names on file.${weakNote}`
            : `No matches found among ${parties.length} names on file.`;

  return { outcome, summary, hits, partiesSearched: parties.length };
}
