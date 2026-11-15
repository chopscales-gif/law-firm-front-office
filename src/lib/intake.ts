/** Shared vocabulary for an inquiry, used by the chat, the scoring rules and the staff screens. */

export const FIRM = {
  name: "Alder & Finch Law",
  shortName: "Alder & Finch",
  city: "Salt Lake City, Utah",
  address: "410 Example Avenue, Suite 200, Salt Lake City, UT 84000",
  phone: "(801) 555-0100",
  email: "intake@alderfinch.example",
  site: "https://alderfinch.example",
  attorney: "Naomi Alder",
  hourlyRate: 285,
  retainer: { family: 3500, estate: 1500 },
  flatFees: { will: 950, trust: 2800, probate: 3200, "power-of-attorney": 350 } as Record<string, number>,
  servedCounties: ["Salt Lake", "Utah", "Davis", "Summit"],
} as const;

/**
 * The firm as one visitor sees it. A visitor can put their own firm's name on
 * the demo; everything else about the firm stays invented. The name is passed
 * into whatever writes text (chat replies, letters, messages, the PDF), so
 * nothing reads it from a global.
 */
export type Firm = Omit<typeof FIRM, "name" | "shortName" | "email" | "site"> & {
  name: string;
  /** The name as it opens a text message. */
  shortName: string;
  email: string;
  site: string;
  /** True when the name is one the visitor typed, not the fictional firm's. */
  custom: boolean;
};

/** The fictional firm, as the demo shows it until a visitor types a name. */
export const DEMO_FIRM: Firm = { ...FIRM, custom: false };

/**
 * A visitor's own name must not be shown beside the fictional firm's web
 * address, so the addresses become placeholders on the reserved .example domain.
 */
export function firmFor(customName: string | null | undefined): Firm {
  if (!customName) return DEMO_FIRM;
  return { ...FIRM, name: customName, shortName: customName, email: "intake@yourfirm.example", site: "https://yourfirm.example", custom: true };
}

/** The firm for a letter already written, from the name stored with it. */
export function firmOnLetter(storedName: string | undefined): Firm {
  return firmFor(!storedName || storedName === FIRM.name ? null : storedName);
}

/**
 * The name for the end of a sentence. A name such as "Reyes & Cole, P.C."
 * brings its own full stop, and the sentence must not add a second one.
 */
export const beforeStop = (name: string) => name.replace(/\.+$/, "");

export const FIRM_NAME_MIN = 2;
export const FIRM_NAME_MAX = 60;

/**
 * Letters, digits, spaces and the punctuation a firm name uses. Every character
 * allowed here is in Windows-1252, the only set the PDF's built-in fonts can
 * draw, so a name that passes is printed on the letter exactly as typed.
 */
const FIRM_NAME_CHARACTERS = /^[A-Za-z0-9À-ÖØ-öø-ÿ &',.()/+-]+$/;

export type FirmNameResult = { ok: true; name: string } | { ok: false; error: string };

/** Tidies and checks a firm name a visitor typed. Plain text only. */
export function cleanFirmName(raw: string): FirmNameResult {
  const name = raw
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < FIRM_NAME_MIN || name.length > FIRM_NAME_MAX) {
    return { ok: false, error: `Use between ${FIRM_NAME_MIN} and ${FIRM_NAME_MAX} characters.` };
  }
  if (!FIRM_NAME_CHARACTERS.test(name) || !/[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(name)) {
    return { ok: false, error: "Use letters, numbers, spaces and & ' , . - ( ) only." };
  }
  return { ok: true, name };
}

export const MATTER_TYPES = {
  divorce: { label: "Divorce", area: "family" },
  custody: { label: "Child custody", area: "family" },
  "child-support": { label: "Child support", area: "family" },
  adoption: { label: "Adoption", area: "family" },
  guardianship: { label: "Guardianship", area: "family" },
  will: { label: "Will", area: "estate" },
  trust: { label: "Living trust", area: "estate" },
  probate: { label: "Probate", area: "estate" },
  "power-of-attorney": { label: "Power of attorney", area: "estate" },
  outside: { label: "Outside our practice areas", area: "outside" },
} as const;

export type MatterType = keyof typeof MATTER_TYPES;
export type PracticeArea = "family" | "estate" | "outside";
export type Urgency = "deadline" | "soon" | "planning";
export type LeadSource = "referral" | "returning" | "search" | "other";

export type IntakeSignals = {
  /** Family matters: children are involved. */
  children?: boolean;
  /** A home or other real estate is involved. */
  realEstate?: boolean;
  /** A business interest is involved. */
  business?: boolean;
};

export type IntakeData = {
  matterType: MatterType;
  name: string;
  /** The opposing party in a family matter. Null when there is none. */
  adverseName: string | null;
  /** Other people connected to the matter, such as a spouse in an estate plan. */
  relatedNames: string[];
  state: string;
  county: string | null;
  urgency: Urgency;
  signals: IntakeSignals;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  /** ISO timestamp of the consultation the prospect picked, or null if they asked for a call back. */
  consultAt: string | null;
  /** The prospect's own words about what they need. */
  description: string;
  /** The prospect mentioned abuse, threats or danger. Staff see these first. */
  safetyConcern: boolean;
};

export function areaOf(type: MatterType): PracticeArea {
  return MATTER_TYPES[type].area;
}

export function matterLabel(type: MatterType): string {
  return MATTER_TYPES[type].label;
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  deadline: "Court date or deadline",
  soon: "Within a month or two",
  planning: "Planning ahead",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  referral: "Referred by someone",
  returning: "Returning client",
  search: "Online search",
  other: "Other",
};
