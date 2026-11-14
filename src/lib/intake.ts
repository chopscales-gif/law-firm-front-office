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
