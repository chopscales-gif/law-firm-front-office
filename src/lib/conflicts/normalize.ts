/** Turns free-typed names into comparable parts. No matching decisions are made here. */

export type ParsedPerson = {
  kind: "person";
  raw: string;
  /** Given name, or "" when only a surname was supplied. */
  first: string;
  middles: string[];
  /** Full surname, hyphenated parts joined with "-". */
  last: string;
  /** Surname split on hyphens: "omalley-reyes" gives ["omalley", "reyes"]. */
  lastParts: string[];
  /** A nickname written in quotes or brackets, e.g. Margaret "Peggy" Lindqvist. */
  nick: string | null;
};

export type ParsedOrganization = {
  kind: "organization";
  raw: string;
  /** Distinguishing words, with legal suffixes and filler removed and abbreviations expanded. */
  tokens: string[];
  /** Initial letters of every word in the name as written, e.g. "wrpm". */
  initials: string;
};

export type ParsedName = ParsedPerson | ParsedOrganization;

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "hon", "judge", "atty", "attorney", "prof", "rev", "sir"]);
const GENERATIONAL = new Set(["jr", "sr", "ii", "iii", "iv", "v", "esq", "md", "phd", "dds", "cpa", "jd", "rn"]);
const SURNAME_PARTICLES = new Set(["de", "del", "della", "di", "da", "dos", "van", "von", "der", "den", "la", "le", "st", "bin", "ibn", "ter", "ten"]);

const LEGAL_SUFFIXES = new Set([
  "llc", "llp", "lp", "pllc", "plc", "pc", "pa", "inc", "incorporated", "corp", "corporation",
  "co", "company", "ltd", "limited", "dba", "na",
]);
const ORG_FILLER = new Set(["the", "of", "and", "for", "at", "in", "a"]);
/** Words that mark a name as a business or institution rather than a person. */
const ORG_MARKERS = new Set([
  ...LEGAL_SUFFIXES,
  "trust", "bank", "group", "holdings", "partners", "associates", "services", "properties", "property",
  "management", "enterprises", "foundation", "association", "church", "university", "school", "district",
  "city", "county", "department", "clinic", "hospital", "plumbing", "heating", "construction", "realty",
  "estate", "insurance", "financial", "credit", "union", "motors", "dental", "medical", "landscaping",
  "roofing", "electric", "builders", "homes", "apartments", "storage", "solutions", "systems", "agency",
  "studio", "restaurant", "cafe", "market", "supply", "logistics", "transport", "ventures", "capital",
  "investments", "mortgage", "hoa", "fund", "center", "institute", "ministries", "cooperative", "lab", "labs",
]);
const ORG_ABBREVIATIONS: Record<string, string> = {
  mgmt: "management", mgt: "management", svcs: "services", svc: "services", assoc: "associates",
  assn: "association", intl: "international", natl: "national", bros: "brothers", ctr: "center",
  dept: "department", prop: "property", props: "properties", const: "construction", constr: "construction",
  fin: "financial", ins: "insurance", grp: "group", hldgs: "holdings", ent: "enterprises",
  mfg: "manufacturing", dist: "distribution", univ: "university", hosp: "hospital", apts: "apartments",
};
/** Common words that say little about which business it is; they count for less when comparing. */
export const GENERIC_ORG_WORDS = new Set([
  "trust", "bank", "group", "holdings", "partners", "associates", "services", "service", "property",
  "management", "enterprises", "foundation", "association", "solutions", "systems", "agency", "family",
  "utah", "wasatch", "mountain", "valley", "national", "international", "american", "first", "united",
  "general", "western", "rocky", "salt", "lake", "home", "capital", "investments", "ventures", "supply",
]);

/** Lowercase, strip accents and apostrophes, collapse whitespace. Hyphens and commas survive for the parser. */
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9,\-"()\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Scottish and Irish prefixes are written both ways: MacAllister / McAllister. */
function canonicalSurname(part: string): string {
  return part.length >= 7 && part.startsWith("mac") ? `mc${part.slice(3)}` : part;
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function looksLikeOrganization(name: string): boolean {
  const folded = fold(name).replace(/[",()\-]/g, " ");
  if (/\d/.test(folded)) return true;
  const words = folded.split(" ").filter(Boolean);
  return words.some((w) => ORG_MARKERS.has(w) || ORG_ABBREVIATIONS[w] !== undefined);
}

export function parseOrganization(raw: string): ParsedOrganization {
  const words = fold(raw).replace(/[",()\-]/g, " ").split(" ").filter(Boolean);
  const meaningful = words.filter((w) => !LEGAL_SUFFIXES.has(w) && !ORG_FILLER.has(w));
  const tokens = meaningful.map((w) => singular(ORG_ABBREVIATIONS[w] ?? w));
  const initials = meaningful.map((w) => w[0]).join("");
  return { kind: "organization", raw, tokens, initials };
}

export function parsePerson(raw: string): ParsedPerson {
  let text = fold(raw);

  let nick: string | null = null;
  const quoted = text.match(/["(]\s*([a-z]+)\s*[")]/);
  if (quoted) {
    nick = quoted[1];
    text = text.replace(quoted[0], " ");
  }
  text = text.replace(/["()]/g, " ");

  // "Nguyen, Minh T." is surname-first. "John Smith, Jr." is not.
  const commaParts = text.split(",").map((p) => p.trim()).filter(Boolean);
  let words: string[];
  if (commaParts.length >= 2) {
    const tail = commaParts.slice(1).join(" ").split(" ").filter(Boolean);
    const tailIsSuffixOnly = tail.every((w) => GENERATIONAL.has(w));
    words = tailIsSuffixOnly
      ? commaParts[0].split(" ")
      : [...tail, ...commaParts[0].split(" ")];
  } else {
    words = text.replace(/,/g, " ").split(" ");
  }

  words = words.filter(Boolean);
  while (words.length > 1 && HONORIFICS.has(words[0])) words.shift();
  while (words.length > 1 && GENERATIONAL.has(words[words.length - 1])) words.pop();

  // Fold surname particles into the surname: "maria de la cruz" has the surname "delacruz".
  while (words.length > 2 && SURNAME_PARTICLES.has(words[words.length - 2])) {
    const tail = words.pop()!;
    const particle = words.pop()!;
    words.push(particle + tail);
  }

  if (words.length === 0) {
    return { kind: "person", raw, first: "", middles: [], last: "", lastParts: [], nick };
  }

  const lastRaw = words[words.length - 1];
  const lastParts = lastRaw.split("-").filter(Boolean).map(canonicalSurname);
  const last = lastParts.join("-");
  if (words.length === 1) {
    return { kind: "person", raw, first: "", middles: [], last, lastParts, nick };
  }
  const first = words[0].replace(/-/g, "");
  const middles = words.slice(1, -1).map((w) => w.replace(/-/g, ""));
  return { kind: "person", raw, first, middles, last, lastParts, nick };
}

export function parseName(raw: string, kind?: "person" | "organization"): ParsedName {
  const resolved = kind ?? (looksLikeOrganization(raw) ? "organization" : "person");
  return resolved === "organization" ? parseOrganization(raw) : parsePerson(raw);
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

/** Last ten digits, so "+1 (801) 555-0142" and "801.555.0142" compare equal. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}
