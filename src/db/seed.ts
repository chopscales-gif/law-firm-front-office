import { randomUUID } from "node:crypto";
import { mountainOffsetHours, offerSlots } from "@/lib/chat/engine";
import type { IntakeData } from "@/lib/intake";
import { checkLeadForConflicts, createLead, createLetter, decide, sendForSignature, sign, type Ctx } from "@/server/workflow";
import { matters, parties } from "./schema";

/**
 * Sample data for one visitor's sandbox. Every person, business and matter
 * here is invented. Email addresses use the reserved .example domain and
 * phone numbers use the 555-01xx range reserved for fiction.
 */

type SeedParty = {
  name: string;
  role: "client" | "opposing" | "related";
  kind?: "organization";
  aliases?: string[];
  email?: string;
  phone?: string;
};

type SeedMatter = {
  name: string;
  area: "family" | "estate";
  status: "open" | "closed";
  /** How many days ago the matter was opened. */
  openedDaysAgo: number;
  parties: SeedParty[];
};

/**
 * The firm's existing files. Several names are deliberately awkward (nicknames,
 * former names, accents, hyphens, trade names) because those are the ones a
 * conflict check has to catch.
 */
export const SEED_MATTERS: SeedMatter[] = [
  {
    name: "O'Malley-Reyes: living trust",
    area: "estate",
    status: "open",
    openedDaysAgo: 140,
    parties: [
      { name: "Katherine O'Malley-Reyes", role: "client", aliases: ["Katherine Reyes"], email: "k.omalleyreyes@mail.example", phone: "(801) 555-0111" },
      { name: "Sean O'Malley", role: "related" },
    ],
  },
  {
    name: "Sandoval v. Thornton: divorce",
    area: "family",
    status: "open",
    openedDaysAgo: 96,
    parties: [
      { name: "Lucia Sandoval", role: "client", aliases: ["Lucia Thornton"], email: "lucia.sandoval@mail.example", phone: "(801) 555-0112" },
      { name: "William J. Thornton", role: "opposing" },
    ],
  },
  {
    name: "Park: custody modification",
    area: "family",
    status: "open",
    openedDaysAgo: 61,
    parties: [
      { name: "Elizabeth Park", role: "client", email: "elizabeth.park@mail.example", phone: "(385) 555-0113" },
      { name: "Daniel Park", role: "opposing" },
    ],
  },
  {
    name: "Estate of Ingrid Halvorsen: probate",
    area: "estate",
    status: "open",
    openedDaysAgo: 48,
    parties: [
      { name: "Erik Halvorsen", role: "client", email: "erik@halvorsenplumbing.example", phone: "(801) 555-0114" },
      { name: "Halvorsen Plumbing & Heating Inc.", role: "related", kind: "organization" },
      { name: "Astrid Halvorsen-Meyer", role: "related" },
    ],
  },
  {
    name: "Nguyen: adoption",
    area: "family",
    status: "open",
    openedDaysAgo: 33,
    parties: [
      { name: "Nguyen, Minh T.", role: "client", email: "minh.nguyen@mail.example", phone: "(801) 555-0115" },
      { name: "Linh Nguyen", role: "related" },
    ],
  },
  {
    name: "Estate of Ruth Abernathy: probate",
    area: "estate",
    status: "open",
    openedDaysAgo: 27,
    parties: [
      { name: "Jonathan Abernathy", role: "client", email: "j.abernathy@mail.example", phone: "(435) 555-0116" },
      { name: "Wasatch Ridge Property Management, LLC", role: "related", kind: "organization", aliases: ["WRPM"] },
    ],
  },
  {
    name: "Hernández: guardianship of a minor",
    area: "family",
    status: "open",
    openedDaysAgo: 19,
    parties: [
      { name: "José Hernández", role: "client", email: "jose.hernandez@mail.example", phone: "(801) 555-0117" },
      { name: "Marisol Hernández Ortega", role: "related" },
    ],
  },
  {
    name: "MacAllister: will and powers of attorney",
    area: "estate",
    status: "closed",
    openedDaysAgo: 410,
    parties: [
      { name: "Stephen MacAllister", role: "client", email: "s.macallister@mail.example" },
      { name: "Fiona MacAllister", role: "related" },
    ],
  },
  {
    name: "Lindqvist: living trust",
    area: "estate",
    status: "closed",
    openedDaysAgo: 520,
    parties: [
      { name: 'Margaret "Peggy" Lindqvist', role: "client", phone: "(801) 555-0118" },
      { name: "Lindqvist Family Trust", role: "related", kind: "organization" },
    ],
  },
  {
    name: "Carter v. Carter: divorce",
    area: "family",
    status: "closed",
    openedDaysAgo: 365,
    parties: [
      { name: "Renee Carter", role: "client", aliases: ["Renee Dupree"], email: "renee.carter@mail.example" },
      { name: "DeShawn Carter Sr.", role: "opposing" },
    ],
  },
  {
    name: "Tymczak: child support",
    area: "family",
    status: "closed",
    openedDaysAgo: 290,
    parties: [
      { name: "Sarah Tymczak", role: "client", email: "sarah.tymczak@mail.example", phone: "(801) 555-0119" },
      { name: "Pavel Tymczak", role: "opposing" },
    ],
  },
  {
    name: "Okonkwo: probate",
    area: "estate",
    status: "open",
    openedDaysAgo: 12,
    parties: [
      { name: "Chidi Okonkwo", role: "client", email: "chidi.okonkwo@mail.example", phone: "(385) 555-0120" },
      { name: "Bonneville Shore Credit Union", role: "related", kind: "organization" },
    ],
  },
];

const DAY = 24 * 3600_000;

/** Firms open files on working days: a date that lands on a weekend moves back to the Friday. */
function weekday(date: Date): Date {
  const day = new Date(date.getTime() - 7 * 3600_000).getUTCDay();
  return new Date(date.getTime() - (day === 0 ? 2 : day === 6 ? 1 : 0) * DAY);
}

type Clock = [hour: number, minute: number];

/** The calendar day in Salt Lake City at this moment, held as midnight UTC of that date. */
function firmDay(at: Date): Date {
  const local = new Date(at.getTime() - mountainOffsetHours(at) * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** A clock time in Salt Lake City on a day from firmDay. */
function firmTime(day: Date, [hour, minute]: Clock): Date {
  const noon = new Date(day.getTime() + 19 * 3600_000);
  return new Date(day.getTime() + (hour + mountainOffsetHours(noon)) * 3600_000 + minute * 60_000);
}

/** Minutes past midnight in Salt Lake City. */
function firmMinutes(at: Date): number {
  return Math.round((at.getTime() - firmTime(firmDay(at), [0, 0]).getTime()) / 60_000);
}

/** The working day a number of working days before (negative) or after (positive) this one. */
function workdaysFrom(day: Date, count: number): Date {
  const moved = new Date(day);
  for (let left = Math.abs(count); left > 0; ) {
    moved.setUTCDate(moved.getUTCDate() + Math.sign(count));
    if (moved.getUTCDay() !== 0 && moved.getUTCDay() !== 6) left -= 1;
  }
  return moved;
}

/**
 * When the office first deals with something that arrived at this time: half
 * an hour later during office hours, otherwise first thing on the next working day.
 */
function officePicksUp(arrived: Date): Date {
  const day = firmDay(arrived);
  const minutes = firmMinutes(arrived);
  const workday = day.getUTCDay() !== 0 && day.getUTCDay() !== 6;
  if (workday && minutes >= 8 * 60 + 30 && minutes <= 16 * 60 + 30) return new Date(arrived.getTime() + 35 * 60_000);
  return firmTime(workday && minutes < 8 * 60 + 30 ? day : workdaysFrom(day, 1), [8, 50]);
}

/** People write in from early morning to late evening. A time in the small hours moves back to the evening before. */
function wakingHours(at: Date): Date {
  const day = firmDay(at);
  const minutes = firmMinutes(at);
  if (minutes < 6 * 60 + 30) return firmTime(new Date(day.getTime() - DAY), [22, 30]);
  return minutes > 22 * 60 + 30 ? firmTime(day, [22, 30]) : at;
}

type SeedLead = {
  /**
   * When the inquiry arrived. Older ones are pinned to a time of day some
   * working days back, so the record never shows the office at work at 3 a.m.
   * Today's are a number of hours before "now", kept inside waking hours.
   */
  arrived: { workdaysAgo: number; at: Clock } | { hoursAgo: number };
  channel: "chat" | "form" | "phone";
  intake: Omit<IntakeData, "consultAt"> & { consultSlot: number | null };
  /** How far through the workflow this inquiry has already been taken. */
  stage: "new" | "checked" | "cleared" | "flagged" | "declined" | "letter_sent" | "signed";
  note?: string;
};

const SEED_LEADS: SeedLead[] = [
  {
    arrived: { workdaysAgo: 7, at: [19, 42] },
    channel: "chat",
    stage: "signed",
    intake: {
      matterType: "trust", name: "Rosalind Achterberg", adverseName: null, relatedNames: ["Pieter Achterberg"],
      state: "Utah", county: "Summit", urgency: "soon", signals: { realEstate: true, business: true },
      email: "rosalind.achterberg@mail.example", phone: "(435) 555-0131", source: "referral", consultSlot: null,
      description: "We want a living trust that covers the cabin and my share of the bakery.", safetyConcern: false,
    },
  },
  {
    arrived: { workdaysAgo: 3, at: [12, 18] },
    channel: "chat",
    stage: "letter_sent",
    intake: {
      matterType: "divorce", name: "Gideon Marsh", adverseName: "Elena Marsh", relatedNames: [],
      state: "Utah", county: "Salt Lake", urgency: "deadline", signals: { children: true, realEstate: true },
      email: "gideon.marsh@mail.example", phone: "(801) 555-0132", source: "search", consultSlot: null,
      description: "I was served with divorce papers last week and need to respond.", safetyConcern: false,
    },
  },
  {
    arrived: { workdaysAgo: 2, at: [13, 5] },
    channel: "form",
    stage: "flagged",
    note: "Other side is Elizabeth Park, our client in the custody modification. Do not proceed. N.A. to send a declination.",
    intake: {
      matterType: "custody", name: "Daniel Park", adverseName: "Liz Park", relatedNames: [],
      state: "Utah", county: "Salt Lake", urgency: "soon", signals: { children: true },
      email: "dan.park@mail.example", phone: "(801) 555-0133", source: "search", consultSlot: null,
      description: "My ex-wife wants to change our custody arrangement and I need a lawyer.", safetyConcern: false,
    },
  },
  {
    arrived: { workdaysAgo: 1, at: [10, 40] },
    channel: "phone",
    stage: "declined",
    note: "Lives in Idaho and the case is filed there. Outside our jurisdiction. Declination sent.",
    intake: {
      matterType: "child-support", name: "Petra Lindholm", adverseName: "Anders Lindholm", relatedNames: [],
      state: "Idaho", county: null, urgency: "soon", signals: { children: true },
      email: "petra.lindholm@mail.example", phone: "(208) 555-0134", source: "other", consultSlot: null,
      description: "Called about changing a child support order from an Idaho court.", safetyConcern: false,
    },
  },
  {
    arrived: { workdaysAgo: 1, at: [16, 15] },
    channel: "chat",
    stage: "cleared",
    intake: {
      matterType: "will", name: "Marguerite Dufresne", adverseName: null, relatedNames: [],
      state: "Utah", county: "Davis", urgency: "planning", signals: { realEstate: true },
      email: "m.dufresne@mail.example", phone: null, source: "returning", consultSlot: 1,
      description: "I'd like to update my will now that I've bought a house in Bountiful.", safetyConcern: false,
    },
  },
  {
    arrived: { hoursAgo: 5 },
    channel: "chat",
    stage: "new",
    intake: {
      matterType: "guardianship", name: "Wren Castellanos", adverseName: null, relatedNames: ["Steven McAllister"],
      state: "Utah", county: "Utah", urgency: "soon", signals: { children: true },
      email: "wren.castellanos@mail.example", phone: "(385) 555-0135", source: "referral", consultSlot: 2,
      description: "I need guardianship of my nephew. His grandfather Steven McAllister has been helping care for him.", safetyConcern: false,
    },
  },
  {
    arrived: { hoursAgo: 2 },
    channel: "chat",
    stage: "new",
    intake: {
      matterType: "divorce", name: "Imani Okafor", adverseName: "Bill Thornton", relatedNames: [],
      state: "Utah", county: "Salt Lake", urgency: "deadline", signals: { children: true, realEstate: true },
      email: "imani.okafor@mail.example", phone: "(801) 555-0136", source: "referral", consultSlot: 0,
      description: "My husband filed for divorce and there is a hearing in two weeks. He has been threatening to take the kids.",
      safetyConcern: true,
    },
  },
  {
    arrived: { hoursAgo: 0.6 },
    channel: "form",
    stage: "new",
    intake: {
      matterType: "probate", name: "Hollis Brandt", adverseName: null, relatedNames: ["Corinne Brandt"],
      state: "Utah", county: "Salt Lake", urgency: "soon", signals: { realEstate: true },
      email: "hollis.brandt@mail.example", phone: "(801) 555-0137", source: "search", consultSlot: 1,
      description: "My father passed away in October and my sister and I need help with his estate.", safetyConcern: false,
    },
  },
];

/** Fills a new sandbox by running real inquiries through the real workflow, back-dated. */
export async function seedSandbox(ctx: Ctx): Promise<void> {
  const { db, sandboxId, now, firm } = ctx;

  const matterRows = SEED_MATTERS.map((m) => ({
    id: randomUUID(),
    sandboxId,
    name: m.name,
    practiceArea: m.area,
    status: m.status,
    openedOn: weekday(new Date(now.getTime() - m.openedDaysAgo * DAY)),
    leadId: null,
  }));
  await db.insert(matters).values(matterRows);
  await db.insert(parties).values(
    SEED_MATTERS.flatMap((m, i) =>
      m.parties.map((p) => ({
        id: randomUUID(),
        sandboxId,
        matterId: matterRows[i].id,
        name: p.name,
        aliases: p.aliases ?? [],
        kind: p.kind ?? ("person" as const),
        role: p.role,
        email: p.email ?? null,
        phone: p.phone ?? null,
      })),
    ),
  );

  // Today's inquiries are placed newest first, each at least 80 minutes before the one after it, so the order holds when one is moved to the evening before.
  const arrivals = new Map<SeedLead, Date>();
  let latest = now.getTime();
  for (const seed of [...SEED_LEADS].reverse()) {
    if ("workdaysAgo" in seed.arrived) {
      arrivals.set(seed, firmTime(workdaysFrom(firmDay(now), -seed.arrived.workdaysAgo), seed.arrived.at));
      continue;
    }
    const arrived = new Date(Math.min(latest, wakingHours(new Date(now.getTime() - seed.arrived.hoursAgo * 3600_000)).getTime()));
    arrivals.set(seed, arrived);
    latest = arrived.getTime() - 80 * 60_000;
  }

  // Each seeded inquiry is offered the times still free when it arrives, like a real one.
  const taken: string[] = [];
  for (const seed of SEED_LEADS) {
    const arrived = arrivals.get(seed)!;
    // Nothing in the sample data is dated after the moment the visitor arrives.
    const at = (when: Date): Ctx => ({ db, sandboxId, firm, now: new Date(Math.min(now.getTime(), when.getTime())) });
    const { consultSlot, ...rest } = seed.intake;
    const consultAt = consultSlot === null ? null : offerSlots(now, taken)[consultSlot].iso;
    if (consultAt) taken.push(consultAt);
    const lead = await createLead(at(arrived), { ...rest, consultAt }, seed.channel);
    if (seed.stage === "new") continue;

    const checked = officePicksUp(arrived);
    const decided = new Date(checked.getTime() + 15 * 60_000);
    await checkLeadForConflicts(at(checked), lead.id);
    if (seed.stage === "checked") continue;
    if (seed.stage === "flagged" || seed.stage === "declined") {
      await decide(at(decided), lead.id, seed.stage, seed.note ?? "");
      continue;
    }
    await decide(at(decided), lead.id, "cleared", seed.note ?? "");
    if (seed.stage === "cleared") continue;

    // The letter goes out the afternoon of the next working day, and the client signs it that evening.
    const letterDay = workdaysFrom(firmDay(decided), 1);
    await createLetter(at(firmTime(letterDay, [14, 20])), lead.id);
    const request = await sendForSignature(at(firmTime(letterDay, [14, 25])), lead.id);
    if (seed.stage === "letter_sent") continue;
    await sign(at(firmTime(letterDay, [18, 7])), request.token, { kind: "typed", data: lead.name, consent: true });
  }
}
