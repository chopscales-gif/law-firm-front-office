import { DEMO_FIRM, areaOf, beforeStop, matterLabel, type Firm, type IntakeData, type LeadSource, type MatterType, type Urgency } from "../intake";
import { NO_ADVICE_REPLY, SAFETY_REPLY, SELF_HARM_REPLY, asksForLegalAdvice, isUnplacedQuestion, mentionsSafetyRisk, mentionsSelfHarm } from "./guardrail";

/**
 * The intake conversation as a state machine. Each visitor message fills one
 * or more slots; the engine always asks for the first slot still empty.
 *
 * It is a pure function of (state, message), so the hosted demo can run it with
 * no model at all, and tests cover every branch. When a model is available it
 * only supplies an `Interpretation`; the questions, the order and the guardrails
 * stay here.
 */

export type Step = "matter" | "name" | "otherParty" | "location" | "urgency" | "details" | "contact" | "source" | "slot";

export const STEP_ORDER: Step[] = ["matter", "name", "otherParty", "location", "urgency", "details", "contact", "source", "slot"];

export type ConsultSlot = { iso: string; label: string };

export type ChatState = {
  /** Slots answered so far. A key that is present has been answered, even if the value is null. */
  data: Partial<IntakeData>;
  answered: Step[];
  status: "collecting" | "complete" | "outside";
  /** Consultation times offered to this visitor, fixed when the chat starts. */
  slots: ConsultSlot[];
  /** What the visitor has said in passing, so the assistant does not ask for it again. */
  heard?: Heard;
};

export type Heard = { relation?: string; children?: boolean; realEstate?: boolean; business?: boolean };

export type ChatTurn = {
  state: ChatState;
  replies: string[];
  /** Quick-reply buttons for the next question. */
  suggestions: string[];
  /** True when a guardrail (no legal advice, or safety) produced a reply this turn. */
  guardrail: "advice" | "safety" | null;
};

/** Slot values pulled out of one message, by the keyword parser or by a model. */
export type Interpretation = {
  slots: Partial<IntakeData>;
  answered: Step[];
  asksLegalAdvice?: boolean;
  /** Optional one-line acknowledgement written by a model. */
  acknowledgement?: string;
};

const UTAH_COUNTIES = [
  "Salt Lake", "Utah", "Davis", "Summit", "Weber", "Washington", "Cache", "Tooele", "Box Elder", "Iron",
  "Wasatch", "Uintah", "Sanpete", "Sevier", "Carbon", "Duchesne", "Morgan", "Juab", "Millard", "Grand",
  "Emery", "San Juan", "Kane", "Beaver", "Garfield", "Rich", "Wayne", "Piute", "Daggett",
];
const UTAH_CITIES: Record<string, string> = {
  "salt lake city": "Salt Lake", slc: "Salt Lake", sandy: "Salt Lake", "west valley": "Salt Lake", murray: "Salt Lake",
  draper: "Salt Lake", "west jordan": "Salt Lake", "south jordan": "Salt Lake", holladay: "Salt Lake", millcreek: "Salt Lake",
  provo: "Utah", orem: "Utah", lehi: "Utah", "american fork": "Utah", "spanish fork": "Utah",
  bountiful: "Davis", layton: "Davis", farmington: "Davis", kaysville: "Davis",
  "park city": "Summit", ogden: "Weber", "st george": "Washington", logan: "Cache", tooele: "Tooele",
};
const OTHER_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Vermont", "Virginia", "Washington State",
  "West Virginia", "Wisconsin", "Wyoming",
];

const OUTSIDE_PATTERN =
  /\b(dui|criminal|arrest\w*|charged|injur\w*|accident|immigration|visa|evict\w*|landlord|tenant|bankrupt\w*|lawsuit|sue|sued|suing|contract|employment|fired|patent|trademark|business|llc|tax(es)?|tickets?|speeding|traffic|citation|felony|misdemeanou?r|foreclos\w*|debts?|malpractice|workers'? comp\w*|discriminat\w*|harass\w*|wages?|real estate|zoning|copyright)\b/;

// Checked in order. Words that are also everyday verbs ("will you help", "I don't
// trust him") only count when they are used as the name of a document.
const MATTER_KEYWORDS: [RegExp, MatterType][] = [
  [/\b(divorc\w*|separat\w*|annul\w*|alimony|dissolution)\b/, "divorce"],
  [/\b(custody|parent[- ]?time|visitation|parenting plan)\b/, "custody"],
  [/\bchild support\b/, "child-support"],
  [/\badopt\w*\b(?!.*\b(dogs?|cats?|pets?|pupp\w*|kittens?|animals?)\b)/, "adoption"],
  [/\b(guardian\w*|conservator\w*)\b/, "guardianship"],
  [/\b(power of attorney|poa|health ?care directive|advance directive)\b/, "power-of-attorney"],
  [/\b(probate|executor|inherit\w*)\b/, "probate"],
  [/\b(a|my|our|the|living|family|revocable|or) trust\b|\btrusts\b/, "trust"],
  [/\b(a|my|our|the|his|her|their|new|simple|make|write|update) will\b|\bwills\b|\bestate plan\w*|\btestament\b/, "will"],
  [OUTSIDE_PATTERN, "outside"],
  [/\b(passed away|died|death of)\b/, "probate"],
  [/\b(my ex|kids?|children|co-?parent\w*)\b/, "custody"],
];

export function classifyMatter(text: string): MatterType | null {
  const lower = text.toLowerCase();
  for (const [pattern, type] of MATTER_KEYWORDS) if (pattern.test(lower)) return type;
  return null;
}

const NEGATED = /\b(no|not|never|without|don'?t|doesn'?t|didn'?t|isn'?t|aren'?t|haven'?t|hasn'?t)\b/;

/**
 * Picks up facts a visitor mentions before they are asked: "my husband and I
 * need a trust for our house" names a spouse and a home. A clause that denies
 * something ("we don't have kids") is not taken as mentioning it.
 */
export function listen(text: string): Heard {
  const heard: Heard = {};
  for (const clause of text.toLowerCase().split(/[.;!?,]|\bbut\b/)) {
    const relation = clause.match(/\b(?:my|our) (husband|wife|spouse|partner|ex-husband|ex-wife|ex|fiancee?|co-?parent)\b/)?.[1];
    if (relation && !heard.relation) heard.relation = relation;
    if (NEGATED.test(clause)) continue;
    if (/\b(kids?|child|children|sons?|daughters?)\b/.test(clause)) heard.children = true;
    if (/\b(home|house|condo|cabin)\b/.test(clause)) heard.realEstate = true;
    if (/\b(business|company|llc)\b/.test(clause)) heard.business = true;
  }
  return heard;
}

type Signal = "children" | "realEstate" | "business";
const SIGNAL_WORDS: Record<Signal, { a: string; the: string }> = {
  children: { a: "children", the: "the children" },
  realEstate: { a: "a home", the: "the home" },
  business: { a: "a business", the: "a business" },
};

/** The two things the details question asks about, split into those already mentioned and those not. */
function detailsFor(state: ChatState): { known: Signal[]; missing: Signal[] } {
  const family = state.data.matterType !== undefined && areaOf(state.data.matterType) === "family";
  const pair: Signal[] = family ? ["children", "realEstate"] : ["realEstate", "business"];
  return { known: pair.filter((signal) => state.heard?.[signal]), missing: pair.filter((signal) => !state.heard?.[signal]) };
}

function heardSignals(state: ChatState): Partial<Record<Signal, true>> {
  const { children, realEstate, business } = state.heard ?? {};
  return { ...(children && { children }), ...(realEstate && { realEstate }), ...(business && { business }) };
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

/** The number as the firm writes it, "(801) 555-0188", however the visitor typed it. */
function findPhone(text: string): string | null {
  const digits = text.match(PHONE)?.[0].replace(/\D/g, "").slice(-10);
  return digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .replace(/\b(Mc|O')([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`);
}

/** Pulls a personal or business name out of a conversational answer such as "my wife, Kate Reyes". */
export function extractName(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^(hi|hello|hey)[,!. ]+/i, "")
    .replace(/^(it'?s|its|that would be|that'?s|this is|i am|i'?m|my name is|name'?s|the name is|they are|he is|she is|he'?s|she'?s)\s+/i, "")
    .replace(/^(yes|yeah|yep)[,. ]+/i, "")
    .replace(/^(my|the)\s+((soon[- ]to[- ]be|ex|former|late|current)[- ]?)*\s*(husband|wife|spouse|partner|ex|boyfriend|girlfriend|fiance|fiancee|mother|father|mom|dad|brother|sister|son|daughter|other parent|co-?parent|business partner|co-?owner)\b[\s,:-]*(is|named|called|'s name is)?[\s,:-]*/i, "")
    .trim();
  if (!cleaned || EMAIL.test(cleaned) || /\d/.test(cleaned) || text.includes("?")) return null;
  const words = cleaned.split(/\s+/);
  if (words.length > 5 || words.some((w) => !isNameWord(w))) return null;
  return titleCase(cleaned);
}

/** A word that could be part of a name: letters only, and not everyday intake vocabulary. */
function isNameWord(word: string): boolean {
  return /^[\p{L}][\p{L}'’.-]*$/u.test(word) && !NOT_A_NAME.has(word.toLowerCase().replace(/’/g, "'").replace(/\.$/, ""));
}

const NOT_A_NAME = new Set([
  "i", "need", "want", "help", "the", "is", "are", "was", "have", "has", "we", "you", "it", "not", "dont", "don't",
  "know", "sure", "what", "why", "how", "when", "who", "please", "with", "for", "about", "divorce", "custody",
  "lawyer", "attorney", "yes", "ok", "okay", "thanks", "hello",
  // Answers to the other questions, which must never be taken for a person.
  "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "from", "this", "that", "there", "there's", "theres", "here",
  "my", "me", "mine", "our", "your", "his", "her", "their", "he", "she", "they", "him", "them", "us", "no", "nope", "none",
  "one", "else", "nobody", "anyone", "someone", "just", "only", "both", "neither", "either", "maybe", "idk", "unsure",
  "outside", "inside", "elsewhere", "utah", "county", "city", "state", "lake", "planning", "ahead", "soon", "rush", "urgent",
  "court", "date", "hearing", "deadline", "within", "month", "months", "week", "weeks", "today", "tomorrow", "two",
  "online", "search", "google", "friend", "family", "member", "worked", "before", "something", "other", "home", "children",
  "kids", "business", "call", "instead", "first", "second", "third", "monday", "tuesday", "wednesday", "thursday", "friday",
  "am", "pm", "probate", "guardianship", "adoption", "living", "child", "support", "husband", "wife", "spouse", "partner",
  "ex", "brother", "sister", "mother", "father", "mom", "dad", "son", "daughter", "parent", "rather", "say", "would",
]);

const NONE_PATTERN = /^(no|none|nope|no one|nobody|n\/a|na|nothing|just me|only me|skip|not applicable|no one else|there is(n't| not) (one|anyone))\b/i;
/** "I don't know his name" is an answer too. The firm asks again at the consultation. */
const UNKNOWN_PATTERN = /^(i (really )?(don'?t|do not) know|not sure|no idea|unknown|i'?d rather not|i would rather not|prefer not)\b/i;

const NAME_WORD = "[A-Z][\\p{L}'’-]+";
const SAID_NAME = new RegExp(`\\b(?:[Mm]y name is|[Mm]y name's|[Nn]ame's|I am|I'm|I’m|[Tt]his is)\\s+(${NAME_WORD}(?:\\s+${NAME_WORD}){1,2})`, "u");
const SAID_OTHER = new RegExp(
  `\\b(?:my|our) (?:(?:soon[- ]to[- ]be|ex|former|late)[- ])?(?:husband|wife|spouse|partner|ex|fiancee?|co-?parent|brother|sister|mother|father|mom|dad|son|daughter|business partner)(?:,| is| named|'s name is)?\\s+(${NAME_WORD}\\s+${NAME_WORD})`,
  "u",
);
const SAID_HOME = /\b(?:i|we)(?: am| are|'m|’m|'re|’re)?(?: currently)? (?:live|living|reside|residing|based|located)(?: \w+)? (?:in|near|at|outside of)\b([^.;!?]*)|\b(?:i'm|i’m|i am|we're|we’re|we are) (?:in|from)\b([^.;!?]*)|\bfrom ((?:[a-z]+ ){1,2}county)\b/i;
const SAID_DEADLINE = /\b(served|hearing|court date|deadline|summons|emergency|urgent|asap)\b/;
const SAID_NO_RUSH = /\b(no rush|not urgent|no hurry|planning ahead|plan ahead|no deadline|not in a hurry|whenever)\b/;
const SAID_SOURCE = /\b(found|saw|heard about|came across|looked) (you|your firm|the firm|your website)\b|\b(referred|recommended|told me about you|sent me)\b|\b(worked with|used) (you|your firm|the firm|alder)\b/;

/**
 * Answers to questions that have not been asked yet: "I'm Dana Whitlock from Salt Lake County,
 * no rush". Only plain statements count, so "the house in Bountiful" is not where the visitor lives.
 * Returns what was noted, in the order the questions would have come.
 */
function overhear(text: string, state: ChatState, current: Step): Step[] {
  const noted: Step[] = [];
  const open = (step: Step) => step !== current && !state.answered.includes(step);
  const take = (step: Step, slots: Partial<IntakeData>) => {
    Object.assign(state.data, slots);
    state.answered.push(step);
    noted.push(step);
  };
  const lower = text.toLowerCase();
  const namesWelcome = !["name", "otherParty", "contact", "slot"].includes(current);

  if (namesWelcome && open("name")) {
    const said = text.match(SAID_NAME)?.[1];
    const name = said ? extractName(said) : null;
    if (name && name.includes(" ")) take("name", { name });
  }
  if (namesWelcome && open("otherParty") && state.data.matterType && state.data.matterType !== "outside") {
    const said = text.match(SAID_OTHER)?.[1];
    const name = said ? extractName(said) : null;
    if (name && name.includes(" ") && name !== state.data.name) {
      take("otherParty", areaOf(state.data.matterType) === "family" ? { adverseName: name, relatedNames: [] } : { adverseName: null, relatedNames: [name] });
    }
  }
  if (open("location")) {
    const home = text.match(SAID_HOME);
    const place = home ? parseStep("location", home[1] ?? home[2] ?? home[3], state) : null;
    if (place) take("location", place.slots);
  }
  if (open("urgency") && current !== "slot") {
    const clause = lower.split(/[.;!?,]|\bbut\b/).find((part) => SAID_DEADLINE.test(part) || SAID_NO_RUSH.test(part));
    const urgency = clause ? parseStep("urgency", clause, state) : null;
    if (urgency) take("urgency", urgency.slots);
  }
  if (open("source") && SAID_SOURCE.test(lower)) {
    const clause = lower.split(/[.;!?]/).find((part) => SAID_SOURCE.test(part))!;
    take("source", parseStep("source", clause, state)!.slots);
  }
  return noted;
}

/** One line telling the visitor what was picked up, so skipped questions do not look like forgotten ones. */
function notedLine(noted: Step[], data: Partial<IntakeData>): string | null {
  const parts: string[] = [];
  if (noted.includes("otherParty")) {
    const other = data.adverseName ?? data.relatedNames?.[0];
    if (other) parts.push(`${other}'s name`);
  }
  if (noted.includes("location")) parts.push(data.county ? `that you live in ${data.county} County` : data.state === "Utah" ? "that you live in Utah" : `that you live ${data.state === "Outside Utah" ? "outside Utah" : `in ${data.state}`}`);
  if (noted.includes("urgency")) parts.push(data.urgency === "deadline" ? "that there's a court date or deadline" : data.urgency === "soon" ? "that you want to move soon" : "that there's no rush");
  if (noted.includes("source")) parts.push(data.source === "referral" ? "that you were referred" : data.source === "returning" ? "that you've worked with the firm before" : "how you found the firm");
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `I've noted ${list}.`;
}

const LICENSED_ONLY_IN_UTAH = `One thing to know: the firm's attorneys are licensed only in Utah. If this involves a Utah court or Utah property the firm may still be able to help, so I'll carry on.`;

function parseStep(step: Step, text: string, state: ChatState): Interpretation | null {
  const lower = text.toLowerCase().trim();
  switch (step) {
    case "matter": {
      const type = classifyMatter(text);
      return type ? { slots: { matterType: type, description: text.trim() }, answered: ["matter"] } : null;
    }
    case "name": {
      // "Dana Whitlock, Salt Lake County" and "Dana Whitlock, dana@mail.example" both start with the name.
      const lead = text.replace(EMAIL, " ").replace(PHONE, " ").split(/[,;\n]|\s+(?:and|from|in|or)\s+|\s+(?=i (?:live|am)\b|i'm\b)/i)[0];
      const name = extractName(lead);
      if (!name || name.split(" ").length < 2) return null;
      const place = parseStep("location", text.slice(lead.length).replace(EMAIL, " "), state);
      return place && !state.answered.includes("location")
        ? { slots: { name, ...place.slots }, answered: ["name", "location"] }
        : { slots: { name }, answered: ["name"] };
    }
    case "otherParty": {
      const family = state.data.matterType !== undefined && areaOf(state.data.matterType) === "family";
      if (NONE_PATTERN.test(lower) || UNKNOWN_PATTERN.test(lower)) return { slots: { adverseName: null, relatedNames: [] }, answered: ["otherParty"] };
      const candidates = text
        .split(/\s+and\s+|[;,\n]/i)
        .map((part) => extractName(part))
        .filter((n): n is string => n !== null);
      // A conflict check on a first name or a surname alone proves nothing, so only full names count.
      const names = candidates.filter((n) => n.includes(" ") && n !== state.data.name);
      if (!names.length) return null;
      return family
        ? { slots: { adverseName: names[0], relatedNames: names.slice(1) }, answered: ["otherParty"] }
        : { slots: { adverseName: null, relatedNames: names }, answered: ["otherParty"] };
    }
    case "location": {
      if (/\b(outside|out of|not in) utah\b|\b(another|different|other) state\b/.test(lower)) {
        return { slots: { state: "Outside Utah", county: null }, answered: ["location"] };
      }
      const has = (name: string) => new RegExp(`\\b${name.toLowerCase()}\\b`).test(lower);
      // Other states first, longest names first, so "Davis, California" is not Davis County
      // and "West Virginia" is not Virginia. Washington is a state unless Utah or a county is meant.
      const states = [...OTHER_STATES].sort((a, b) => b.length - a.length);
      for (const other of states) {
        const name = other.replace(" State", "");
        if (!has(name)) continue;
        if (name === "Washington" && /\bwashington county\b|\butah\b|\but\b/.test(lower)) continue;
        return { slots: { state: name, county: null }, answered: ["location"] };
      }
      for (const [city, county] of Object.entries(UTAH_CITIES)) {
        if (has(city)) return { slots: { state: "Utah", county }, answered: ["location"] };
      }
      // Longest names first so "Salt Lake" wins over "Utah" in "Salt Lake County, Utah".
      const counties = [...UTAH_COUNTIES].sort((a, b) => b.length - a.length);
      for (const county of counties) {
        if (county !== "Utah" && has(county)) return { slots: { state: "Utah", county }, answered: ["location"] };
      }
      if (/\butah county\b/.test(lower)) return { slots: { state: "Utah", county: "Utah" }, answered: ["location"] };
      if (/\butah\b|\but\b/.test(lower)) return { slots: { state: "Utah", county: null }, answered: ["location"] };
      return null;
    }
    case "urgency": {
      let urgency: Urgency | null = null;
      // "There's no court date" is not a court date.
      const denied = /\b(no|not|never|without|don'?t|doesn'?t|isn'?t|aren'?t|haven'?t|hasn'?t)\b[^.;,!?]*\b(court|hearing|deadline|served|papers|summons|emergency|urgent|rush|hurry)\b/.test(lower);
      if (denied) urgency = /\b(soon|month|weeks?|shortly|quickly)\b/.test(lower) ? "soon" : "planning";
      else if (/\b(court|hearing|deadline|served|papers|summons|emergency|urgent|asap|right away|immediately|this week|next week|tomorrow)\b/.test(lower)) urgency = "deadline";
      else if (/\b(soon|month|weeks?|shortly|quickly)\b/.test(lower)) urgency = "soon";
      else if (/\b(planning|plan ahead|no rush|not urgent|whenever|eventually|someday|just looking|exploring|no deadline|no date)\b/.test(lower)) urgency = "planning";
      return urgency ? { slots: { urgency }, answered: ["urgency"] } : null;
    }
    case "details": {
      const neither = /\b(neither|none|no|nope|nothing)\b/.test(lower) && !/\b(both|kids?|child\w*|home|house|property|business)\b/.test(lower);
      const both = /\bboth\b/.test(lower);
      const family = state.data.matterType !== undefined && areaOf(state.data.matterType) === "family";
      const children = /\b(kids?|child\w*|son|daughter|minor)\b/.test(lower);
      const realEstate = /\b(home|house|property|real estate|land|condo|cabin)\b/.test(lower);
      const business = /\b(business|company|llc|practice|shop|firm)\b/.test(lower);
      // After "You mentioned a home. Is a business involved as well?", a bare yes means the business.
      const { known, missing } = detailsFor(state);
      if (known.length === 1 && /^(yes|yeah|yep|it is|there is)\b/.test(lower) && !children && !realEstate && !business) {
        return { slots: { signals: { ...heardSignals(state), [missing[0]]: true } }, answered: ["details"] };
      }
      if (!neither && !both && !children && !realEstate && !business) return null;
      const said = neither
        ? {}
        : both
          ? family ? { children: true, realEstate: true } : { realEstate: true, business: true }
          : { ...(children && { children }), ...(realEstate && { realEstate }), ...(business && { business }) };
      // "Neither" answers the question that was asked. What was mentioned earlier still stands.
      return { slots: { signals: { ...heardSignals(state), ...said } }, answered: ["details"] };
    }
    case "contact": {
      const email = text.match(EMAIL)?.[0] ?? null;
      const phone = findPhone(text);
      return email || phone ? { slots: { email, phone }, answered: ["contact"] } : null;
    }
    case "source": {
      let source: LeadSource = "other";
      if (/\b(refer\w*|friend|family|recommend\w*|told me|coworker|colleague|neighbou?r|word of mouth)\b/.test(lower)) source = "referral";
      else if (/\b(before|previous\w*|returning|existing client|used you|worked with)\b/.test(lower)) source = "returning";
      else if (/\b(google|search\w*|online|website|internet|bing|maps)\b/.test(lower)) source = "search";
      return { slots: { source }, answered: ["source"] };
    }
    case "slot": {
      if (/\b(call me|call back|phone me|none of|no time|rather|another time|different time|don'?t work)\b/.test(lower)) {
        return { slots: { consultAt: null }, answered: ["slot"] };
      }
      const byLabel = state.slots.find((s) => lower.includes(s.label.toLowerCase()));
      if (byLabel) return { slots: { consultAt: byLabel.iso }, answered: ["slot"] };
      // "Monday", "Tuesday at 2:30" or "the 18th": taken when it points at exactly one of the offered times.
      const mentioned = state.slots.filter((s) => {
        const [weekday, , date, clock] = s.label.toLowerCase().replace(",", "").split(" ");
        const time = new RegExp(`(^|[^\\d:])${clock}(?!\\d|:)`).test(lower);
        return new RegExp(`\\b${weekday.slice(0, 3)}`).test(lower) || new RegExp(`\\b${date}(st|nd|rd|th)\\b`).test(lower) || time;
      });
      if (mentioned.length === 1) return { slots: { consultAt: mentioned[0].iso }, answered: ["slot"] };
      const ordinal = lower.match(/\b(first|second|third|1st|2nd|3rd|[123])\b/)?.[1];
      const index = ordinal ? { first: 0, "1st": 0, "1": 0, second: 1, "2nd": 1, "2": 1, third: 2, "3rd": 2, "3": 2 }[ordinal] : undefined;
      if (index !== undefined && state.slots[index]) return { slots: { consultAt: state.slots[index].iso }, answered: ["slot"] };
      return null;
    }
  }
}

function firstName(state: ChatState): string {
  return state.data.name?.split(" ")[0] ?? "";
}

/** The question for a step, with its quick replies. */
export function promptFor(step: Step, state: ChatState, firm: Firm = DEMO_FIRM): { text: string; suggestions: string[] } {
  const family = state.data.matterType !== undefined && areaOf(state.data.matterType) === "family";
  switch (step) {
    case "matter":
      return {
        text: "What do you need help with?",
        suggestions: ["Divorce", "Child custody", "A will or trust", "Probate", "Guardianship", "Something else"],
      };
    case "name":
      return { text: "Thanks. What's your full name?", suggestions: [] };
    case "otherParty": {
      const relation = state.heard?.relation;
      if (relation) {
        const whose = /husband/.test(relation) ? "his" : /wife/.test(relation) ? "her" : "their";
        const why = family ? "I need it so the firm can check it doesn't already represent them." : "The firm checks every name for conflicts of interest.";
        return { text: `Thanks, ${firstName(state)}. You mentioned your ${relation}. What's ${whose} full name? ${why}`, suggestions: [] };
      }
      return family
        ? {
            text: `Thanks, ${firstName(state)}. Who is the other person involved, such as your spouse or the other parent? I need their full name so the firm can check it doesn't already represent them.`,
            suggestions: ["There's no one else"],
          }
        : {
            text: `Thanks, ${firstName(state)}. Is anyone else part of this, such as a spouse or a co-owner? Full names let the firm check for conflicts of interest.`,
            suggestions: ["Just me"],
          };
    }
    case "location":
      return {
        text: "Where do you live? The firm is licensed in Utah.",
        suggestions: ["Salt Lake County", "Utah County", "Davis County", "Summit County", "Elsewhere in Utah", "Outside Utah"],
      };
    case "urgency":
      return {
        text: "How soon do you need to move on this?",
        suggestions: ["There's a court date or deadline", "Within a month or two", "Just planning ahead"],
      };
    case "details": {
      const { known, missing } = detailsFor(state);
      if (known.length === 1) {
        const [has, lacks] = [SIGNAL_WORDS[known[0]], SIGNAL_WORDS[missing[0]]];
        return {
          text: `You mentioned ${has.a}. ${lacks.a === "children" ? "Are children" : `Is ${lacks.a}`} involved as well?`,
          suggestions: [`Yes, ${lacks.a} too`, `No, just ${has.the}`],
        };
      }
      return family
        ? { text: "Are children or a home involved?", suggestions: ["Children", "A home", "Both", "Neither"] }
        : { text: "Does this involve a home or a business?", suggestions: ["A home", "A business", "Both", "Neither"] };
    }
    case "contact":
      return { text: "What's the best email or phone number to reach you? Either one works, and both is better.", suggestions: [] };
    case "source":
      return {
        text: "How did you hear about the firm?",
        suggestions: ["A friend or family member", "I've worked with the firm before", "Online search", "Something else"],
      };
    case "slot":
      return {
        text: `Last step. ${firm.attorney} offers a free 30-minute consultation. Which time suits you?`,
        suggestions: [...state.slots.map((s) => s.label), "Call me instead"],
      };
  }
}

/** Short re-ask used after a refusal, an FAQ answer, or an answer the parser could not read. */
const REASK: Record<Step, string> = {
  matter: "What kind of matter is this? A few words is fine, or pick one below.",
  name: "What's your first and last name?",
  otherParty: "What's the other person's first and last name? Or tell me there's no one else.",
  location: "Which county or state do you live in?",
  urgency: "Is there a court date or deadline, or are you planning ahead?",
  details: "Which of the options below fits best?",
  contact: "What's an email address or phone number the firm can reach you on?",
  source: "How did you hear about the firm?",
  slot: "Which of the times below suits you? You can also ask for a call back.",
};

// The office address is part of the sample data, whatever name the firm goes by.
const FAQ: [RegExp, string][] = [
  [/\b(cost|price|fee|charge|free|how much)\b.*\b(consult\w*|call|appointment|meeting)\b|\b(consult\w*|call|appointment)\b.*\b(cost|price|fee|charge|free)\b/, "The first consultation is free and lasts 30 minutes."],
  [/\b(your|office) (hours|address|location)\b|\bwhere are you (located|based)\b|\bwhen are you open\b/, `The office is at ${DEMO_FIRM.address}, open weekdays 8:30 to 5:30.`],
  [/\b(are you|is this) (a |an )?(real|human|person|bot|robot|ai|lawyer|attorney)\b/, "I'm an automated intake assistant, not a lawyer. A person at the firm reviews everything I collect."],
];

function nextStep(state: ChatState): Step | null {
  return STEP_ORDER.find((s) => !state.answered.includes(s)) ?? null;
}

export function startChat(slots: ConsultSlot[], firm: Firm = DEMO_FIRM): ChatTurn {
  const state: ChatState = { data: {}, answered: [], status: "collecting", slots };
  const prompt = promptFor("matter", state, firm);
  return {
    state,
    replies: [
      `Hi, I'm the intake assistant for ${beforeStop(firm.name)}. I'll take a few details and book you a free consultation. I can't give legal advice.`,
      prompt.text,
    ],
    suggestions: prompt.suggestions,
    guardrail: null,
  };
}

function summary(data: Partial<IntakeData>, slots: ConsultSlot[]): string {
  const slot = slots.find((s) => s.iso === data.consultAt);
  const when = slot ? `Your consultation is booked for ${slot.label}.` : "Someone from the firm will call you to set a time.";
  const confirm = data.email ? ` A confirmation would be emailed to ${data.email} (this demo sends nothing).` : "";
  return `That's everything, ${data.name?.split(" ")[0]}. ${when}${confirm} Nothing here creates an attorney-client relationship until you and the firm sign an engagement letter.`;
}

/**
 * Advances the conversation by one visitor message.
 * `interpretation` lets a model supply the slot values; without it the keyword parser runs.
 */
export function respond(previous: ChatState, message: string, interpretation?: Interpretation, firm: Firm = DEMO_FIRM): ChatTurn {
  const state: ChatState = { ...previous, data: { ...previous.data }, answered: [...previous.answered] };
  const text = message.trim();

  if (state.status !== "collecting") {
    return {
      state,
      replies: ["This conversation is finished. Start a new one if you'd like to send another inquiry."],
      suggestions: [],
      guardrail: null,
    };
  }

  const current = nextStep(state)!;
  const replies: string[] = [];
  let guardrail: ChatTurn["guardrail"] = null;

  if (mentionsSafetyRisk(text)) {
    state.data.safetyConcern = true;
    replies.push(mentionsSelfHarm(text) ? SELF_HARM_REPLY : SAFETY_REPLY);
    guardrail = "safety";
  }

  const faq = FAQ.find(([pattern]) => pattern.test(text.toLowerCase()));
  // The deterministic checks always run; a model can add to them but never switch them off.
  // A question that parses as an answer to the current step ("Salt Lake County?") is an answer.
  const longEnough = current === "matter" || text.split(/\s+/).length >= 4;
  const unplaced = !faq && longEnough && isUnplacedQuestion(text) && (current === "matter" || parseStep(current, text, state) === null);
  // "Can I do Friday?" at the last step is about the calendar, not the law.
  const otherTime =
    current === "slot" && !asksForLegalAdvice(text) && !interpretation?.asksLegalAdvice && parseStep("slot", text, state) === null &&
    /\b(mon|tues?|wed(nes)?|thur?s?|fri|satur|sun)(day)?\b|\b(morning|afternoon|evening|earlier|later|sooner|next week|this week|today|tomorrow|weekend|another|different|other) ?(day|time|date|slot)?\b|\d/i.test(text);
  if (otherTime) {
    replies.push("Those three are the times I can book from here. If none of them works, choose \"Call me instead\" and the firm will find a time with you.");
  } else if (asksForLegalAdvice(text) || interpretation?.asksLegalAdvice || unplaced) {
    replies.push(NO_ADVICE_REPLY);
    guardrail = guardrail ?? "advice";
  } else if (faq) {
    replies.push(faq[1]);
  }

  // A question or a disclosure is not an answer. After a guardrail or FAQ reply only the
  // opening question is still parsed, because "can my ex take the kids?" does name the matter.
  const sidetracked = replies.length > 0;
  let parsed: Interpretation | null;
  if (interpretation) parsed = interpretation;
  else if (!sidetracked || current === "matter") parsed = parseStep(current, text, state);
  else if (guardrail === "safety" && replies.length === 1) {
    // "My husband Cole Marsh, he has been threatening me" still answers the question.
    // Only the part of the message that is not the disclosure is read as an answer.
    const rest = text.split(/[,.;!]| and | but /i).filter((part) => part.trim() && !mentionsSafetyRisk(part)).join(", ");
    parsed = rest ? parseStep(current, rest, state) : null;
  } else parsed = null;

  // Read before the answer is parsed, so "Neither" keeps what was mentioned in this same message too.
  // Names, contact details and times are not listened to: "Jim House" does not own a home.
  if (!["name", "otherParty", "contact", "slot"].includes(current)) state.heard = { ...listen(text), ...state.heard };

  if (parsed) {
    Object.assign(state.data, parsed.slots);
    for (const step of parsed.answered) if (!state.answered.includes(step)) state.answered.push(step);
  }
  // Both things the details question asks about have already come up, so it is not asked.
  if (!state.answered.includes("details") && state.data.matterType && state.data.matterType !== "outside" && !detailsFor(state).missing.length) {
    state.data.signals = heardSignals(state);
    state.answered.push("details");
  }
  const noted = state.data.matterType && state.data.matterType !== "outside" ? overhear(text, state, current) : [];
  // Contact details offered early are kept, whatever the current question was.
  if (!state.answered.includes("contact")) {
    const email = text.match(EMAIL)?.[0];
    const phone = findPhone(text);
    if (email || phone) {
      state.data.email = email ?? null;
      state.data.phone = phone ?? null;
      state.answered.push("contact");
    }
  }

  if (state.data.matterType === "outside") {
    state.status = "outside";
    replies.push(
      `Thanks for telling me. ${firm.name} only handles family law and estate planning, so the firm can't take this on. The Utah State Bar keeps a directory of lawyers by practice area that can point you to the right kind of attorney.`,
    );
    return { state, replies, suggestions: [], guardrail };
  }

  const answeredCurrent = state.answered.includes(current);
  if (answeredCurrent && interpretation?.acknowledgement) replies.push(interpretation.acknowledgement.slice(0, 200));
  if (answeredCurrent && current === "matter" && state.data.matterType) {
    const willAndTrust = /\bwills?\b/i.test(text) && /\btrusts?\b/i.test(text) && ["will", "trust"].includes(state.data.matterType);
    replies.push(`Got it: ${willAndTrust ? "a will and a trust" : matterLabel(state.data.matterType).toLowerCase()}. The firm handles that.`);
  }

  const upcoming = nextStep(state);
  if (!upcoming) {
    state.status = "complete";
    state.data.relatedNames = state.data.relatedNames ?? [];
    state.data.safetyConcern = state.data.safetyConcern ?? false;
    state.data.description = state.data.description ?? "";
    replies.push(summary(state.data, state.slots));
    return { state, replies, suggestions: [], guardrail };
  }

  const note = notedLine(noted, state.data);
  if (note) replies.push(note);
  if (state.data.state && state.data.state !== "Utah" && (noted.includes("location") || (current === "location" && answeredCurrent) || (current === "name" && parsed?.answered.includes("location")))) {
    replies.push(LICENSED_ONLY_IN_UTAH);
  }

  const prompt = promptFor(upcoming, state, firm);
  if (answeredCurrent) replies.push(prompt.text);
  else if (otherTime) return { state, replies, suggestions: prompt.suggestions, guardrail };
  else if (current === "matter" && !replies.length && /^(hi|hello|hey|good (morning|afternoon|evening))\b[\s\w]{0,12}[.!]*$/i.test(text)) {
    replies.push(`Hello. ${REASK.matter}`);
  }
  else if (current === "otherParty" && !replies.length && extractName(text) === null && /\b(husband|wife|spouse|partner|ex|brother|sister|mother|father|mom|dad|son|daughter|parent)\b/i.test(text)) {
    replies.push("The firm checks names against its client list, so I need their first and last name. Or tell me there's no one else.");
  }
  else if (current === "matter" && !replies.length && /^(something else|other|not sure|none of (these|those))\b/i.test(text)) {
    replies.push("No problem. In a few words, what is it about?");
  }
  else if (current === "matter" && !replies.length) {
    replies.push(
      `I couldn't match that to what the firm does. ${firm.name} handles divorce, custody and support, adoption, guardianship, wills, trusts and probate. If yours is one of those, pick it below or say it another way. If it isn't, the firm is probably not the right fit, and you can call ${firm.phone} to check.`,
    );
  }
  else if (guardrail === "safety") replies.push(`When you are ready to carry on: ${REASK[upcoming]}`);
  else replies.push(replies.length ? `To get you booked: ${REASK[upcoming]}` : `Sorry, I didn't catch that. ${REASK[upcoming]}`);
  return { state, replies, suggestions: prompt.suggestions, guardrail };
}

/** The completed intake, or null while the conversation is still going. */
export function completedIntake(state: ChatState): IntakeData | null {
  return state.status === "complete" ? (state.data as IntakeData) : null;
}

/** Hours Mountain Time is behind UTC at this moment: 7 in winter, 6 during daylight saving. */
export function mountainOffsetHours(at: Date): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: FIRM_TIME_ZONE, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const hours = Number(part?.match(/GMT([+-]\d+)/)?.[1]);
  return Number.isFinite(hours) ? -hours : 7;
}

const FIRM_TIME_ZONE = "America/Denver";

/** The attorney's consultation times on any weekday, as [hour, minute] in the firm's local time. */
const CONSULT_TIMES: [number, number][] = [[10, 0], [14, 30], [11, 0], [15, 30]];

/**
 * Three weekday consultation times starting from the next business day, in the firm's local time.
 * `taken` holds the times already booked (ISO strings), so two people are never offered the same one.
 */
export function offerSlots(now: Date, taken: readonly string[] = []): ConsultSlot[] {
  const booked = new Set(taken.map((iso) => new Date(iso).getTime()));
  const slots: ConsultSlot[] = [];
  // Work in the firm's calendar, so "tomorrow" is tomorrow in Salt Lake City.
  const day = new Date(now.getTime() - mountainOffsetHours(now) * 3600_000);
  while (slots.length < 3) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const noonUtc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 19));
    // Each day leads with a different time, so the three offers are spread across the day.
    const i = slots.length;
    const at = [...CONSULT_TIMES.slice(i), ...CONSULT_TIMES.slice(0, i)]
      .map(([hour, minute]) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + mountainOffsetHours(noonUtc), minute)))
      .find((time) => !booked.has(time.getTime()));
    // A fully booked day is skipped.
    if (!at) continue;
    slots.push({ iso: at.toISOString(), label: formatSlot(at) });
  }
  return slots;
}

export function formatSlot(at: Date): string {
  const local = new Date(at.getTime() - mountainOffsetHours(at) * 3600_000);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][local.getUTCDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][local.getUTCMonth()];
  const hour = local.getUTCHours();
  const minute = local.getUTCMinutes();
  const clock = `${((hour + 11) % 12) + 1}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "am" : "pm"}`;
  return `${weekday} ${month} ${local.getUTCDate()}, ${clock}`;
}
