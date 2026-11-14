import { FIRM, areaOf, type IntakeData } from "./intake";

export type ScoreFactor = {
  label: string;
  points: number;
  /** Most points this factor can give, so the screen can show "12 of 20". */
  max: number;
  detail: string;
};

export type LeadScore = {
  /** 0 to 100. */
  total: number;
  tier: "hot" | "warm" | "cool";
  factors: ScoreFactor[];
};

type ScoringInput = Pick<
  IntakeData,
  "matterType" | "state" | "county" | "urgency" | "signals" | "email" | "phone" | "source"
>;

/**
 * Transparent, rule-based lead score. Every point is traceable to a factor the
 * firm can read and change; there is no model here on purpose.
 */
export function scoreLead(input: ScoringInput): LeadScore {
  const factors: ScoreFactor[] = [];
  const area = areaOf(input.matterType);

  factors.push(
    area === "outside"
      ? { label: "Practice fit", points: 0, max: 30, detail: "Not a family or estate matter. Refer out." }
      : { label: "Practice fit", points: 30, max: 30, detail: `${area === "family" ? "Family law" : "Estate planning"} is a core practice area.` },
  );

  const inUtah = input.state.trim().toLowerCase() === "utah";
  const served = inUtah && input.county !== null && (FIRM.servedCounties as readonly string[]).includes(input.county);
  factors.push(
    served
      ? { label: "Location", points: 20, max: 20, detail: `${input.county} County is in the firm's home area.` }
      : inUtah
        ? { label: "Location", points: 12, max: 20, detail: "In Utah, outside the firm's home counties." }
        : { label: "Location", points: 0, max: 20, detail: "Outside Utah. The firm is licensed in Utah only." },
  );

  const urgency = {
    deadline: { points: 20, detail: "Has a court date or deadline. Needs a fast response." },
    soon: { points: 13, detail: "Wants to move within a month or two." },
    planning: { points: 6, detail: "Planning ahead with no fixed date." },
  }[input.urgency];
  factors.push({ label: "Urgency", max: 20, ...urgency });

  const stakes = [
    input.signals.children ? "children" : null,
    input.signals.realEstate ? "a home or real estate" : null,
    input.signals.business ? "a business" : null,
  ].filter((s): s is string => s !== null);
  factors.push({
    label: "What is involved",
    points: Math.min(10, stakes.length * 5),
    max: 10,
    detail: stakes.length ? `Involves ${stakes.join(" and ")}.` : "No children, property or business mentioned.",
  });

  const source = {
    referral: { points: 10, detail: "Referred by someone who knows the firm." },
    returning: { points: 10, detail: "Has worked with the firm before." },
    search: { points: 5, detail: "Found the firm through an online search." },
    other: { points: 3, detail: "Source not specified." },
  }[input.source];
  factors.push({ label: "How they found us", max: 10, ...source });

  const channels = [input.email, input.phone].filter(Boolean).length;
  factors.push({
    label: "Contact details",
    points: channels * 5,
    max: 10,
    detail: channels === 2 ? "Gave both an email and a phone number." : channels === 1 ? "Gave one way to reach them." : "No contact details.",
  });

  const total = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0));
  const tier = area === "outside" ? "cool" : total >= 75 ? "hot" : total >= 50 ? "warm" : "cool";
  return { total, tier, factors };
}

/** What the firm sees instead of the internal tier name. */
export const TIER_LABEL = { hot: "Strong fit", warm: "Good fit", cool: "Weak fit" } as const;
