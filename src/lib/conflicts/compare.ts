import { areNicknames } from "./nicknames";
import {
  GENERIC_ORG_WORDS,
  parseName,
  type ParsedOrganization,
  type ParsedPerson,
} from "./normalize";
import { isLikelyMisspelling, jaroWinkler, soundex } from "./similarity";

export type MatchBasis =
  | "exact"
  | "nickname"
  | "spelling"
  | "sounds-alike"
  | "partial-surname"
  | "initial"
  | "reordered"
  | "surname-only"
  | "business-name"
  | "initials"
  | "surname-in-business"
  | "email"
  | "phone";

export type NameComparison = {
  /** 0 to 1. 1 means the names are the same once formatting is ignored. */
  score: number;
  basis: MatchBasis;
  /** Plain-language explanations, written for an attorney, of why the names were linked. */
  reasons: string[];
};

type Part = { score: number; basis: MatchBasis; reason: string | null };

const NONE: Part = { score: 0, basis: "exact", reason: null };

function cap(word: string): string {
  return word
    .split("-")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join("-");
}

function compareSurnames(a: ParsedPerson, b: ParsedPerson): Part {
  if (!a.last || !b.last) return NONE;
  if (a.last === b.last) return { score: 1, basis: "exact", reason: null };

  for (const pa of a.lastParts) {
    for (const pb of b.lastParts) {
      if (pa === pb && (a.lastParts.length > 1 || b.lastParts.length > 1)) {
        return {
          score: 0.9,
          basis: "partial-surname",
          reason: `Shares the surname "${cap(pa)}"; one of them is hyphenated`,
        };
      }
    }
  }

  let best: Part = NONE;
  for (const pa of a.lastParts) {
    for (const pb of b.lastParts) {
      if (isLikelyMisspelling(pa, pb)) {
        const partial = a.lastParts.length > 1 || b.lastParts.length > 1;
        const candidate: Part = {
          score: partial ? 0.8 : 0.86,
          basis: "spelling",
          reason: `Surnames differ by a letter or two: "${cap(pa)}" and "${cap(pb)}"`,
        };
        if (candidate.score > best.score) best = candidate;
      } else if (
        pa.length >= 4 &&
        pb.length >= 4 &&
        soundex(pa) === soundex(pb) &&
        jaroWinkler(pa, pb) >= 0.85
      ) {
        const candidate: Part = {
          score: 0.78,
          basis: "sounds-alike",
          reason: `Surnames sound alike: "${cap(pa)}" and "${cap(pb)}"`,
        };
        if (candidate.score > best.score) best = candidate;
      }
    }
  }
  return best;
}

function compareGivenNames(a: ParsedPerson, b: ParsedPerson): Part {
  const fa = a.first;
  const fb = b.first;
  if (!fa || !fb) return NONE;
  if (fa === fb) return { score: 1, basis: "exact", reason: null };

  if (areNicknames(fa, fb)) {
    return { score: 0.95, basis: "nickname", reason: `"${cap(fa)}" and "${cap(fb)}" are forms of the same name` };
  }
  if ((a.nick && (a.nick === fb || areNicknames(a.nick, fb))) || (b.nick && (b.nick === fa || areNicknames(b.nick, fa)))) {
    const nick = a.nick && (a.nick === fb || areNicknames(a.nick, fb)) ? a.nick : b.nick!;
    return { score: 0.95, basis: "nickname", reason: `Goes by "${cap(nick)}" according to the file` };
  }
  if ((fa.length === 1 || fb.length === 1) && fa[0] === fb[0]) {
    return { score: 0.7, basis: "initial", reason: "Only a first initial to compare, and it matches" };
  }
  if (isLikelyMisspelling(fa, fb)) {
    return {
      score: 0.85,
      basis: "spelling",
      reason: `Given names differ by a letter or two: "${cap(fa)}" and "${cap(fb)}"`,
    };
  }
  // Some people go by a middle name: "J. Robert Finley" and "Robert Finley".
  const aUsesMiddle = b.middles.some((m) => m.length > 1 && (m === fa || areNicknames(m, fa)));
  const bUsesMiddle = a.middles.some((m) => m.length > 1 && (m === fb || areNicknames(m, fb)));
  if (aUsesMiddle || bUsesMiddle) {
    return { score: 0.75, basis: "nickname", reason: "Given name matches the other person's middle name" };
  }
  return NONE;
}

/** Negative when both have middle names that cannot belong to the same person; positive when they agree. */
function middleAdjustment(a: ParsedPerson, b: ParsedPerson): { delta: number; reason: string | null } {
  if (!a.middles.length || !b.middles.length) return { delta: 0, reason: null };
  const ma = a.middles[0];
  const mb = b.middles[0];
  const compatible = ma === mb || ((ma.length === 1 || mb.length === 1) && ma[0] === mb[0]);
  return compatible
    ? { delta: 0.03, reason: null }
    : { delta: -0.12, reason: `Middle names differ ("${cap(ma)}" and "${cap(mb)}"), which makes a match less likely` };
}

function comparePeopleInOrder(a: ParsedPerson, b: ParsedPerson): NameComparison | null {
  const surname = compareSurnames(a, b);
  const given = compareGivenNames(a, b);

  if (surname.score > 0 && given.score > 0) {
    const middle = middleAdjustment(a, b);
    const score = Math.max(0, Math.min(1, (surname.score + given.score) / 2 + middle.delta));
    const reasons = [surname.reason, given.reason, middle.reason].filter((r): r is string => r !== null);
    const weakest = surname.score <= given.score ? surname : given;
    const exact = surname.score === 1 && given.score === 1 && middle.delta >= 0;
    if (exact) return { score: 1, basis: "exact", reasons: ["Same name"] };
    return { score, basis: weakest.score === 1 ? "exact" : weakest.basis, reasons: reasons.length ? reasons : ["Same given name and surname"] };
  }

  // A surname alone ("Halvorsen") is all the searcher gave us.
  if (surname.score > 0 && (!a.first || !b.first)) {
    return {
      score: surname.score * 0.6,
      basis: "surname-only",
      reasons: [surname.reason ?? "Same surname", "No given name to compare"],
    };
  }

  // One person's surname is the other's middle or second surname: "Maria Garcia Lopez" and "Maria Garcia".
  if (given.score >= 0.85) {
    const aLastInB = b.middles.some((m) => m.length > 1 && a.lastParts.includes(m));
    const bLastInA = a.middles.some((m) => m.length > 1 && b.lastParts.includes(m));
    if (aLastInB || bLastInA) {
      return {
        score: 0.8 * given.score,
        basis: "partial-surname",
        reasons: ["One surname appears as the other's middle or second surname", ...(given.reason ? [given.reason] : [])],
      };
    }
  }

  if (surname.score === 1 && a.first && b.first) {
    return { score: 0.42, basis: "surname-only", reasons: ["Same surname, different given name. Possibly a relative"] };
  }
  return null;
}

function comparePeople(a: ParsedPerson, b: ParsedPerson): NameComparison | null {
  const direct = comparePeopleInOrder(a, b);
  if (direct && direct.score >= 0.75) return direct;

  // "Nguyen Minh" typed where the file has "Minh Nguyen".
  if (a.first && a.last && !a.middles.length && a.lastParts.length === 1) {
    const swapped: ParsedPerson = { ...a, first: a.last, last: a.first, lastParts: [a.first] };
    const reversed = comparePeopleInOrder(swapped, b);
    if (reversed && reversed.score >= 0.85 && reversed.score * 0.95 > (direct?.score ?? 0)) {
      return {
        score: reversed.score * 0.95,
        basis: "reordered",
        reasons: ["Given name and surname appear in the opposite order", ...reversed.reasons.filter((r) => r !== "Same name")],
      };
    }
  }
  return direct;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (isLikelyMisspelling(a, b)) return 0.85;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short)) return 0.8;
  return 0;
}

function weight(token: string): number {
  return GENERIC_ORG_WORDS.has(token) ? 0.4 : 1;
}

function compareOrganizations(a: ParsedOrganization, b: ParsedOrganization): NameComparison | null {
  if (!a.tokens.length || !b.tokens.length) return null;
  if (a.tokens.join(" ") === b.tokens.join(" ")) {
    return { score: 1, basis: "exact", reasons: ["Same business name once suffixes like LLC or Inc. are ignored"] };
  }

  // "WRPM" against "Wasatch Ridge Property Management".
  for (const [short, long] of [[a, b], [b, a]] as const) {
    if (short.tokens.length === 1 && long.initials.length >= 3 && short.tokens[0] === long.initials) {
      return { score: 0.82, basis: "initials", reasons: [`"${short.raw.trim()}" matches the initials of "${long.raw.trim()}"`] };
    }
  }

  const [short, long] = a.tokens.length <= b.tokens.length ? [a, b] : [b, a];
  const used = new Set<number>();
  let matchedWeight = 0;
  let inexact = false;
  let distinctiveMatched = false;
  for (const token of short.tokens) {
    let bestIndex = -1;
    let bestScore = 0;
    long.tokens.forEach((other, i) => {
      if (used.has(i)) return;
      const s = tokenSimilarity(token, other);
      if (s > bestScore) {
        bestScore = s;
        bestIndex = i;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matchedWeight += bestScore * weight(token);
      if (bestScore < 1) inexact = true;
      if (!GENERIC_ORG_WORDS.has(token)) distinctiveMatched = true;
    }
  }
  if (!distinctiveMatched) return null;

  const shortTotal = short.tokens.reduce((sum, t) => sum + weight(t), 0);
  const longTotal = long.tokens.reduce((sum, t) => sum + weight(t), 0);
  const coverageShort = matchedWeight / shortTotal;
  const coverageLong = matchedWeight / longTotal;
  if (coverageShort < 0.66) return null;

  const score = Math.min(0.97, coverageShort * 0.7 + coverageLong * 0.3);
  const reasons = [
    coverageLong > 0.99
      ? "Business names use the same words"
      : `"${short.raw.trim()}" is contained in "${long.raw.trim()}"`,
  ];
  if (inexact) reasons.push("Some words are abbreviated or spelled differently");
  return { score, basis: "business-name", reasons };
}

function comparePersonToOrganization(person: ParsedPerson, org: ParsedOrganization): NameComparison | null {
  const hit = person.lastParts.find((p) => p.length >= 4 && org.tokens.includes(p));
  if (!hit) return null;
  return {
    score: 0.45,
    basis: "surname-in-business",
    reasons: [`The surname "${cap(hit)}" appears in the business name`],
  };
}

/**
 * Compares two names as typed. Returns null when there is nothing worth showing an attorney.
 * The optional kinds skip auto-detection of person versus business.
 */
export function compareNames(
  a: string,
  b: string,
  kinds: { a?: "person" | "organization"; b?: "person" | "organization" } = {},
): NameComparison | null {
  const pa = parseName(a, kinds.a);
  const pb = parseName(b, kinds.b);
  if (pa.kind === "person" && pb.kind === "person") return comparePeople(pa, pb);
  if (pa.kind === "organization" && pb.kind === "organization") return compareOrganizations(pa, pb);
  return pa.kind === "person"
    ? comparePersonToOrganization(pa, pb as ParsedOrganization)
    : comparePersonToOrganization(pb as ParsedPerson, pa);
}
