import { formatSlot } from "../chat/engine";
import { FIRM, areaOf, matterLabel, type MatterType } from "../intake";
import { TIER_LABEL } from "../scoring";

/**
 * Everything the app would send to the outside world: emails, texts, and
 * practice-management API calls. Nothing here is transmitted. Each message is
 * written to the outbox table so the demo can show exactly what would have gone out.
 */

export type Outgoing = {
  channel: "email" | "sms" | "clio";
  recipient: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown>;
  sendAt?: Date;
};

type LeadLike = {
  name: string;
  email: string | null;
  phone: string | null;
  matterType: MatterType;
  consultAt: Date | null;
  score: number;
  scoreTier: "hot" | "warm" | "cool";
  safetyConcern: boolean;
};

const first = (name: string) => name.trim().split(/\s+/)[0];

/** Links in a message are written the way the recipient would get them, on the firm's (fictional) site. */
const link = (path: string) => (path.startsWith("/") ? `${FIRM.site}${path}` : path);

export function inquiryMessages(lead: LeadLike, staffUrl: string): Outgoing[] {
  const out: Outgoing[] = [];
  const when = lead.consultAt ? formatSlot(lead.consultAt) : null;

  if (lead.email) {
    out.push({
      channel: "email",
      recipient: lead.email,
      subject: when ? `Your consultation with ${FIRM.name} on ${when}` : `We received your inquiry`,
      body: [
        `Hi ${first(lead.name)},`,
        when
          ? `Your free 30-minute consultation with ${FIRM.attorney} is booked for ${when} (Mountain Time).`
          : `Thanks for getting in touch. Someone from the firm will call you to arrange a consultation.`,
        `Please note that ${FIRM.name} does not represent you until you and the firm have both signed an engagement letter. Until then, please don't send us confidential documents.`,
        `${FIRM.name}\n${FIRM.phone}`,
      ].join("\n\n"),
    });
  }

  if (lead.phone && lead.consultAt) {
    out.push({
      channel: "sms",
      recipient: lead.phone,
      subject: "Consultation reminder",
      body: `${FIRM.shortName}: reminder of your consultation with ${FIRM.attorney} on ${when}. Reply C to confirm or R to reschedule.`,
      sendAt: new Date(lead.consultAt.getTime() - 24 * 3600_000),
    });
  }

  out.push({
    channel: "email",
    recipient: FIRM.email,
    subject: `${lead.safetyConcern ? "[Safety concern] " : ""}New ${matterLabel(lead.matterType).toLowerCase()} inquiry: ${lead.name} (score ${lead.score})`,
    body: [
      `${lead.name} sent a new inquiry. Matter: ${matterLabel(lead.matterType).toLowerCase()}.`,
      `Intake score: ${lead.score} out of 100 (${TIER_LABEL[lead.scoreTier].toLowerCase()}).`,
      lead.safetyConcern ? "They mentioned a safety concern. Please review this one first." : null,
      when ? `Consultation booked: ${when}.` : "No consultation time chosen. They asked for a call back.",
      `Run the conflict check before the consultation: ${link(staffUrl)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  return out;
}

export function declineMessage(lead: LeadLike): Outgoing | null {
  if (!lead.email) return null;
  return {
    channel: "email",
    recipient: lead.email,
    subject: `Your inquiry to ${FIRM.name}`,
    body: [
      `Dear ${first(lead.name)},`,
      `Thank you for contacting ${FIRM.name}. We are not able to represent you in this matter, and we have not taken any action on your behalf.`,
      `Deadlines may apply to your situation. If you want to pursue it, please contact another attorney promptly. The Utah State Bar keeps a directory of lawyers by practice area.`,
      `${FIRM.attorney}\n${FIRM.name}`,
    ].join("\n\n"),
  };
}

export function signatureRequestMessage(lead: LeadLike, signingUrl: string): Outgoing {
  return {
    channel: "email",
    recipient: lead.email ?? `${lead.name} (no email on file: send link by text)`,
    subject: `Please sign your engagement letter with ${FIRM.name}`,
    body: [
      `Hi ${first(lead.name)},`,
      `Your engagement letter is ready. Please read it and sign online. It takes about two minutes.`,
      link(signingUrl),
      `${FIRM.attorney}\n${FIRM.name}`,
    ].join("\n\n"),
    payload: {
      note: "A production build would create this envelope with an e-signature provider instead of the built-in signing page.",
      signer: { name: lead.name, email: lead.email },
      redirect_url: signingUrl,
    },
  };
}

export function signedMessages(lead: LeadLike, matterName: string): Outgoing[] {
  const out: Outgoing[] = [];
  if (lead.email) {
    out.push({
      channel: "email",
      recipient: lead.email,
      subject: `Your signed engagement letter`,
      body: [
        `Hi ${first(lead.name)},`,
        `Thank you. A signed copy of your engagement letter is attached for your records, and ${FIRM.name} now represents you in this matter.`,
        `Attached: Engagement letter, signed (PDF)`,
        `${FIRM.attorney}\n${FIRM.name}`,
      ].join("\n\n"),
    });
  }
  out.push({
    channel: "email",
    recipient: FIRM.email,
    subject: `Signed: ${lead.name}. Matter opened`,
    body: `${lead.name} signed the engagement letter. The matter "${matterName}" has been opened and sent to Clio.`,
  });
  return out;
}

/**
 * The two calls that would create the client and the matter in Clio Manage.
 * The request bodies follow the shape of Clio's v4 REST API, but they have not
 * been run against a live Clio account.
 */
export function clioMessages(
  lead: LeadLike & { county: string | null },
  matterName: string,
  openedOn: Date,
): Outgoing[] {
  const words = lead.name.trim().split(/\s+/);
  const contact = {
    method: "POST",
    url: "https://app.clio.com/api/v4/contacts.json",
    body: {
      data: {
        type: "Person",
        first_name: words.slice(0, -1).join(" ") || words[0],
        last_name: words.length > 1 ? words.at(-1) : "",
        email_addresses: lead.email ? [{ name: "Home", address: lead.email, default_email: true }] : [],
        phone_numbers: lead.phone ? [{ name: "Mobile", number: lead.phone, default_number: true }] : [],
      },
    },
  };
  const matter = {
    method: "POST",
    url: "https://app.clio.com/api/v4/matters.json",
    body: {
      data: {
        client: { id: "<id returned by the contact call>" },
        description: matterName,
        status: "Open",
        open_date: openedOn.toISOString().slice(0, 10),
        practice_area: { name: areaOf(lead.matterType) === "estate" ? "Estate Planning" : "Family" },
        location: lead.county ? `${lead.county} County, UT` : null,
        responsible_attorney: { name: FIRM.attorney },
      },
    },
  };
  return [
    {
      channel: "clio",
      recipient: "Clio Manage",
      subject: `Create contact: ${lead.name}`,
      body: `Adds ${lead.name} to Clio as a client, with the contact details from intake.`,
      payload: contact,
    },
    {
      channel: "clio",
      recipient: "Clio Manage",
      subject: `Open matter: ${matterName}`,
      body: `Opens the matter in Clio under ${lead.name}, with ${FIRM.attorney} as responsible attorney.`,
      payload: matter,
    },
  ];
}
