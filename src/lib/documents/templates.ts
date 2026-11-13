import { FIRM, areaOf, matterLabel, type MatterType } from "../intake";

/**
 * Engagement letter templates. Text in {{double braces}} is filled from the intake answers.
 * These are sample letters written for the demo. They are not legal forms.
 */

export type Block = { type: "heading" | "paragraph" | "list"; text: string; items?: string[] };

export type TemplateKey = "engagement-family" | "engagement-estate";

type Template = { key: TemplateKey; title: string; description: string; blocks: Block[] };

const CLOSING: Block[] = [
  {
    type: "heading",
    text: "Conflicts of interest",
  },
  {
    type: "paragraph",
    text: "Before sending this letter we checked the names you gave us against our records of clients and other parties, and on that basis we are able to act for you. Please tell us right away if other people or businesses become involved.",
  },
  { type: "heading", text: "Ending the engagement" },
  {
    type: "paragraph",
    text: "You may end this engagement at any time by telling us in writing. We may withdraw where the professional conduct rules allow or require it. Fees for work done up to that point remain payable.",
  },
  { type: "heading", text: "Agreement" },
  {
    type: "paragraph",
    text: "If these terms are acceptable, please sign below. Our work begins once we have your signature{{retainerClause}}.",
  },
];

export const TEMPLATES: Record<TemplateKey, Template> = {
  "engagement-family": {
    key: "engagement-family",
    title: "Engagement letter: family law",
    description: "Hourly engagement with a retainer, for divorce, custody, support, adoption and guardianship matters.",
    blocks: [
      { type: "paragraph", text: "{{date}}" },
      { type: "paragraph", text: "{{clientName}}\n{{clientContact}}" },
      { type: "paragraph", text: "Re: {{matterTitle}}" },
      { type: "paragraph", text: "Dear {{clientFirstName}}," },
      {
        type: "paragraph",
        text: "Thank you for choosing {{firmName}}. This letter sets out what we will do for you, what it will cost, and what we each agree to.",
      },
      { type: "heading", text: "What we will do" },
      {
        type: "paragraph",
        text: "We will represent you in your {{matterNoun}} matter{{adverseClause}}. This covers advice, negotiation, preparing and filing court documents, and appearing at hearings in the {{court}}. It does not cover an appeal or any separate matter unless we agree to that in writing.",
      },
      { type: "heading", text: "Who will do the work" },
      {
        type: "paragraph",
        text: "{{attorney}} will be the attorney responsible for your matter. Other attorneys and staff may help where that saves you money.",
      },
      { type: "heading", text: "Fees" },
      {
        type: "list",
        text: "",
        items: [
          "Attorney time is billed at ${{hourlyRate}} an hour, in six-minute increments.",
          "A retainer of ${{retainer}} is due when you sign. We hold it in our client trust account and bill against it monthly.",
          "Court filing fees and other costs are passed on at cost, with receipts.",
          "We send an itemized statement every month, whether or not there is a balance.",
        ],
      },
      ...CLOSING,
    ],
  },
  "engagement-estate": {
    key: "engagement-estate",
    title: "Engagement letter: estate planning",
    description: "Flat-fee engagement for wills, living trusts and powers of attorney.",
    blocks: [
      { type: "paragraph", text: "{{date}}" },
      { type: "paragraph", text: "{{clientName}}\n{{clientContact}}" },
      { type: "paragraph", text: "Re: {{matterTitle}}" },
      { type: "paragraph", text: "Dear {{clientFirstName}}," },
      {
        type: "paragraph",
        text: "Thank you for choosing {{firmName}}. This letter sets out what we will do for you, what it will cost, and what we each agree to.",
      },
      { type: "heading", text: "What we will do" },
      {
        type: "paragraph",
        text: "{{estateScope}}",
      },
      { type: "heading", text: "Who will do the work" },
      {
        type: "paragraph",
        text: "{{attorney}} will be the attorney responsible for this work.",
      },
      { type: "heading", text: "Fees" },
      {
        type: "list",
        text: "",
        items: [
          "The fee for this work is a flat ${{flatFee}}.",
          "{{estateSchedule}}",
          "Work outside the scope above is billed at ${{hourlyRate}} an hour, and only after you approve it.",
        ],
      },
      ...CLOSING,
    ],
  },
};

export function templateFor(type: MatterType): TemplateKey {
  return areaOf(type) === "estate" ? "engagement-estate" : "engagement-family";
}

export type LetterInput = {
  name: string;
  email: string | null;
  phone: string | null;
  matterType: MatterType;
  adverseName: string | null;
  relatedNames: string[];
  county: string | null;
  date: Date;
};

const MATTER_NOUN: Record<MatterType, string> = {
  divorce: "divorce",
  custody: "child custody",
  "child-support": "child support",
  adoption: "adoption",
  guardianship: "guardianship",
  will: "will",
  trust: "living trust and pour-over will",
  probate: "probate",
  "power-of-attorney": "powers of attorney",
  outside: "legal",
};

const money = (n: number) => n.toLocaleString("en-US");

/** The values that go into the letter, shown to staff beside the preview so they can see what was merged. */
export function letterFields(input: LetterInput): Record<string, string> {
  const area = areaOf(input.matterType);
  const flatFee = FIRM.flatFees[input.matterType] ?? FIRM.flatFees.will;
  const probate = input.matterType === "probate";
  const related = input.relatedNames.length ? `, taking into account ${input.relatedNames.join(" and ")}` : "";
  const surname = input.name.trim().split(/\s+/).at(-1) ?? input.name;
  const contact = [input.email, input.phone].filter(Boolean).join("\n");
  return {
    date: input.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Denver" }),
    clientName: input.name,
    clientFirstName: input.name.trim().split(/\s+/)[0],
    clientContact: contact || "Contact details on file",
    matterTitle: `${surname}: ${matterLabel(input.matterType).toLowerCase()}`,
    matterNoun: MATTER_NOUN[input.matterType],
    adverseClause: input.adverseName ? `, in which the other party is ${input.adverseName}` : "",
    // Probate is court work on someone's estate, not a set of documents to draft.
    estateScope: probate
      ? `We will act for you in the probate of the estate${input.relatedNames.length ? ` of ${input.relatedNames[0]}` : ""}. This covers preparing and filing the application, notices to heirs and creditors, and guiding the personal representative through to closing the estate. It does not cover a contested hearing, tax returns, or selling property.`
      : `We will prepare your ${MATTER_NOUN[input.matterType]}${related}. This covers a planning meeting, drafting, one round of revisions, and a signing meeting with witnesses and a notary. It does not cover transferring property titles, tax returns, or later amendments.`,
    estateSchedule: probate
      ? "Half is due when you sign this letter and half when the estate is closed."
      : "Half is due when you sign this letter and half at the signing meeting.",
    court: input.county ? `district court for ${input.county} County, Utah` : "Utah district courts",
    attorney: FIRM.attorney,
    firmName: FIRM.name,
    hourlyRate: money(FIRM.hourlyRate),
    retainer: money(FIRM.retainer.family),
    flatFee: money(flatFee),
    retainerClause: area === "family" ? " and the retainer" : " and the first half of the fee",
  };
}

/** Replaces every {{field}}. An unknown field is left visible so a broken template is obvious. */
export function merge(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in fields ? fields[key] : whole));
}

export function renderLetter(key: TemplateKey, input: LetterInput): { title: string; blocks: Block[]; fields: Record<string, string> } {
  const template = TEMPLATES[key];
  const fields = letterFields(input);
  const blocks = template.blocks.map((block) => ({
    type: block.type,
    text: merge(block.text, fields),
    ...(block.items && { items: block.items.map((item) => merge(item, fields)) }),
  }));
  return { title: `Engagement letter for ${input.name}`, blocks, fields };
}

export function letterPlainText(blocks: Block[]): string {
  return blocks.map((b) => (b.type === "list" ? (b.items ?? []).map((i) => `- ${i}`).join("\n") : b.text)).join("\n\n");
}
