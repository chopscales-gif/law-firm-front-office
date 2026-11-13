import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { DecisionForm } from "@/components/decision-form";
import { HitList } from "@/components/hit-list";
import { Letter } from "@/components/letter";
import { OutcomeChip, Score, StatusChip } from "@/components/ui";
import { formatSlot } from "@/lib/chat/engine";
import { fmtDateTime } from "@/lib/format";
import { SOURCE_LABEL, URGENCY_LABEL, matterLabel } from "@/lib/intake";
import { createLetterAction, runCheckAction, sendForSignatureAction } from "@/server/actions";
import { findLead, matterForLead, outboxFor, signatureFor } from "@/server/queries";
import { getCtx } from "@/server/session";
import { getDocument, latestCheck } from "@/server/workflow";

export const metadata: Metadata = { title: "Inquiry" };

type StepState = "done" | "current" | "waiting" | "skipped";

const CHANNEL = { chat: "Website chat", form: "Website form", phone: "Phone call" };
const OUTBOX_CHANNEL = { email: "Email", sms: "Text", clio: "Clio" };

export default async function LeadPage({ params }: PageProps<"/staff/leads/[id]">) {
  const { id } = await params;
  const ctx = await getCtx();
  const lead = await findLead(ctx, id);
  if (!lead) notFound();

  const [check, document, matter, outbox] = await Promise.all([
    latestCheck(ctx, lead.id),
    getDocument(ctx, lead.id),
    matterForLead(ctx, lead.id),
    outboxFor(ctx, lead.id),
  ]);
  const signature = document ? await signatureFor(ctx, document.id) : null;

  const stopped = lead.status === "flagged" || lead.status === "declined";
  const decided = lead.status !== "new";
  const sent = lead.status === "letter_sent" || lead.status === "signed";
  const signed = lead.status === "signed";
  const after = (reached: boolean, current: boolean): StepState => (reached ? "done" : stopped ? "skipped" : current ? "current" : "waiting");

  const signals = [lead.signals.children && "Children", lead.signals.realEstate && "A home or other property", lead.signals.business && "A business"].filter(Boolean);
  const facts: [string, string][] = [
    ["Matter", matterLabel(lead.matterType)],
    ["Other side", lead.adverseName ?? "None named"],
    ["Also involved", lead.relatedNames.join(", ") || "No one else named"],
    ["Lives in", lead.county ? `${lead.county} County, ${lead.state}` : lead.state],
    ["Timing", URGENCY_LABEL[lead.urgency]],
    ["Involves", signals.join(", ") || "Nothing noted"],
    ["Email", lead.email ?? "Not given"],
    ["Phone", lead.phone ?? "Not given"],
    ["Heard about us", SOURCE_LABEL[lead.source]],
    ["Consultation", lead.consultAt ? formatSlot(lead.consultAt) : "Asked for a call back"],
  ];
  const clioCalls = outbox.filter((m) => m.channel === "clio").reverse();

  return (
    <>
      <Link href="/staff" className="text-sm font-semibold text-juniper hover:underline">
        Back to inquiries
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="font-serif text-3xl leading-tight">{lead.name}</h1>
          <p className="mt-1 text-muted">
            {matterLabel(lead.matterType)}. {CHANNEL[lead.channel]}, {fmtDateTime(lead.createdAt)}.
          </p>
        </div>
        <StatusChip status={lead.status} />
      </div>
      {lead.safetyConcern && (
        <p className="mt-4 rounded-md border border-flag/40 bg-flag-tint px-4 py-3 text-[0.9375rem] text-flag">
          <strong className="font-semibold">Safety concern.</strong> This person mentioned threats or danger. The assistant gave them the emergency numbers, and this
          inquiry stays at the top of the list until someone acts on it.
        </p>
      )}

      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <ol>
          <Step n={1} title="Intake" state="done" summary={`Scored ${lead.score} of 100`}>
            {lead.description && (
              <blockquote className="border-l-2 border-juniper pl-4 font-serif text-lg leading-relaxed">&ldquo;{lead.description}&rdquo;</blockquote>
            )}
            <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.8125rem] text-muted">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="panel mt-6 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Why this score</h3>
                <Score value={lead.score} tier={lead.scoreTier} size="lg" />
              </div>
              <ul className="mt-3 space-y-3">
                {lead.scoreFactors.map((factor) => (
                  <li key={factor.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                    <span className="text-[0.9375rem] font-semibold">{factor.label}</span>
                    <span className="text-[0.9375rem] tabular-nums text-muted">
                      {factor.points} of {factor.max}
                    </span>
                    <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-paper">
                      <span className="block h-full rounded-full bg-brass" style={{ width: `${(factor.points / factor.max) * 100}%` }} />
                    </span>
                    <span className="col-span-2 text-[0.8125rem] text-muted">{factor.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[0.8125rem] text-muted">The score is a set of written rules the firm can read and change. No AI model is involved.</p>
            </div>
          </Step>

          <Step
            n={2}
            title="Conflict check"
            state={check ? "done" : "current"}
            summary={check ? `Checked ${fmtDateTime(check.ranAt)} against ${check.partiesSearched} names on file` : "Not run yet"}
          >
            {check ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <OutcomeChip outcome={check.outcome} />
                  <p className="text-[0.9375rem]">{check.summary}</p>
                </div>
                <p className="mt-2 text-[0.8125rem] text-muted">Names searched: {check.subjects.map((s) => s.name).join(", ")}.</p>
                <div className="mt-4">
                  <HitList hits={check.hits} />
                </div>
                {!sent && (
                  <div className="mt-4">
                    <ActionButton action={runCheckAction.bind(null, lead.id)} pendingLabel="Checking" variant="quiet">
                      Run the check again
                    </ActionButton>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mb-4 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
                  Searches every client, opposing party and related name on file for {lead.name}
                  {lead.adverseName ? `, ${lead.adverseName}` : ""} and anyone else named, including nicknames, former names and misspellings.
                </p>
                <ActionButton action={runCheckAction.bind(null, lead.id)} pendingLabel="Checking">
                  Run conflict check
                </ActionButton>
              </>
            )}
          </Step>

          <Step
            n={3}
            title="Attorney decision"
            state={decided ? "done" : check ? "current" : "waiting"}
            summary={decided && lead.decidedAt ? `Decided ${fmtDateTime(lead.decidedAt)}` : check ? "Waiting for a decision" : "After the conflict check"}
          >
            {decided ? (
              <>
                <p className="text-[0.9375rem]">
                  {lead.status === "flagged" ? "Held for attorney review." : lead.status === "declined" ? "Declined. A declination email is in the outbox." : "Cleared to proceed."}
                </p>
                {lead.decisionNote && <p className="mt-2 border-l-2 border-line pl-3 text-[0.9375rem] text-muted">{lead.decisionNote}</p>}
                {!sent && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-juniper">Change the decision</summary>
                    <div className="mt-3">
                      <DecisionForm leadId={lead.id} noteRequiredToClear={check?.outcome !== "clear"} />
                    </div>
                  </details>
                )}
              </>
            ) : check ? (
              <DecisionForm leadId={lead.id} noteRequiredToClear={check.outcome !== "clear"} />
            ) : null}
          </Step>

          <Step
            n={4}
            title="Engagement letter"
            state={after(sent, lead.status === "cleared")}
            summary={sent ? "Sent for signature" : document ? "Draft ready to send" : "Filled in from the intake answers"}
          >
            {lead.status === "cleared" && !document && (
              <ActionButton action={createLetterAction.bind(null, lead.id)} pendingLabel="Preparing">
                Prepare engagement letter
              </ActionButton>
            )}
            {document && (
              <>
                {lead.status === "cleared" && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <ActionButton action={sendForSignatureAction.bind(null, lead.id)} pendingLabel="Sending">
                      Send for signature
                    </ActionButton>
                    <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn btn-quiet">
                      Open as PDF
                    </a>
                  </div>
                )}
                <details open={lead.status === "cleared"}>
                  <summary className="cursor-pointer text-sm font-semibold text-juniper">Read the letter</summary>
                  <div className="mt-3">
                    <Letter blocks={document.blocks} />
                  </div>
                </details>
              </>
            )}
          </Step>

          <Step
            n={5}
            title="Signature"
            state={after(signed, lead.status === "letter_sent")}
            summary={signed ? "Signed by the client" : sent ? "Waiting for the client" : "Signed online by the client"}
          >
            {signature && (
              <>
                <ul className="space-y-1.5 text-[0.9375rem]">
                  {signature.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap gap-x-3">
                      <span className="w-36 shrink-0 tabular-nums text-muted">{fmtDateTime(event.at)}</span>
                      <span>{event.label}</span>
                    </li>
                  ))}
                </ul>
                {signed && document ? (
                  <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn btn-quiet mt-4">
                    Open the signed PDF
                  </a>
                ) : (
                  <div className="demo-chrome mt-4 rounded-lg bg-ink p-4 text-white">
                    <p className="text-sm font-semibold">Play the client</p>
                    <p className="mt-1 text-sm text-white/75">A real installation would email the signing link (it is in the outbox). Open it here to sign as {lead.name}.</p>
                    <Link href={`/sign/${signature.request.token}`} prefetch={false} className="btn mt-3 bg-white text-ink hover:bg-white/90">
                      Open the signing page
                    </Link>
                  </div>
                )}
              </>
            )}
          </Step>

          <Step n={6} title="Matter opened" state={after(signed && !!matter, false)} summary={matter ? matter.name : "Client and matter would be created in Clio"} last>
            {matter && (
              <>
                <p className="max-w-[62ch] text-[0.9375rem] leading-relaxed">
                  The matter is open, and its parties are now part of every future conflict check. These are the two requests that would create the client and
                  the matter in Clio. In this demo they are recorded, not sent.
                </p>
                <div className="mt-3 space-y-2">
                  {clioCalls.map((call) => (
                    <details key={call.id} className="panel">
                      <summary className="cursor-pointer px-4 py-3 text-[0.9375rem] font-semibold">{call.subject}</summary>
                      <pre className="overflow-x-auto border-t border-line bg-paper p-4 text-[0.8125rem] leading-relaxed">{JSON.stringify(call.payload, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              </>
            )}
          </Step>
        </ol>

        <aside aria-label="Messages for this inquiry">
          <h2 className="font-semibold">Messages for this inquiry</h2>
          <p className="mt-1 text-[0.8125rem] text-muted">What the firm&apos;s systems would have sent. Nothing leaves this demo.</p>
          <ul className="mt-3 space-y-2">
            {outbox.map((message) => (
              <li key={message.id}>
                <Link href={`/staff/outbox#${message.id}`} className="panel block px-3 py-2.5 hover:border-ink">
                  <span className="flex justify-between gap-2 text-[0.8125rem] text-muted">
                    <span className="font-semibold text-ink">{OUTBOX_CHANNEL[message.channel]}</span>
                    <span>{message.sendAt > ctx.now ? `Scheduled ${fmtDateTime(message.sendAt)}` : fmtDateTime(message.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug">{message.subject}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

const MARKER: Record<StepState, string> = {
  done: "border-juniper bg-juniper text-white",
  current: "border-brass bg-brass-tint text-brass",
  waiting: "border-line bg-surface text-muted",
  skipped: "border-line bg-paper text-muted",
};

function Step(props: { n: number; title: string; state: StepState; summary: string; last?: boolean; children?: React.ReactNode }) {
  const { n, title, state, summary, last, children } = props;
  const open = state === "done" || state === "current";
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      {!last && <span aria-hidden className={`absolute bottom-0 left-4 top-8 w-px ${state === "done" ? "bg-juniper" : "bg-line"}`} />}
      <span className={`relative z-[1] flex size-8 items-center justify-center rounded-full border text-sm font-semibold ${MARKER[state]}`}>{n}</span>
      <div className={last ? "" : "pb-9"}>
        <h2 className={`flex min-h-8 flex-wrap items-baseline gap-x-3 pt-1 ${open ? "" : "text-muted"}`}>
          <span className="text-lg font-semibold leading-tight">{title}</span>
          <span className="text-[0.8125rem] font-normal text-muted">{state === "skipped" ? "Not reached" : summary}</span>
        </h2>
        {open && children && <div className="mt-4">{children}</div>}
      </div>
    </li>
  );
}
