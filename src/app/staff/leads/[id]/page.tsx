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
    ["Consultation", lead.consultAt ? formatSlot(lead.consultAt) : lead.channel === "chat" ? "Asked for a call back" : "None booked"],
  ];
  const clioCalls = outbox.filter((m) => m.channel === "clio").reverse();

  return (
    <>
      <Link href="/staff" className="link inline-flex min-h-11 items-center lg:min-h-0">
        Back to inquiries
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-2 border-plum pb-5">
        <div>
          <h1 className="font-serif text-[2.75rem] font-medium leading-[1.05] tracking-[-0.015em]">{lead.name}</h1>
          <p className="mt-2 text-muted">
            {matterLabel(lead.matterType)}. {CHANNEL[lead.channel]}, {fmtDateTime(lead.createdAt)}.
          </p>
        </div>
        <StatusChip status={lead.status} />
      </div>
      {lead.safetyConcern && (
        <p className="mt-5 border-l-4 border-flag bg-flag-tint px-4 py-3 text-flag">
          <strong className="font-semibold">Safety concern.</strong> This person mentioned threats or danger. The assistant gave them the emergency numbers, and this
          inquiry stays at the top of the list until someone acts on it.
        </p>
      )}

      <div className="mt-8 grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <ol>
          <Step n={1} title="Intake" state="done" summary={`Scored ${lead.score} of 100`}>
            {lead.description && (
              <blockquote className="max-w-[58ch] border-l-4 border-rose-pale pl-4 font-serif text-xl leading-relaxed">&ldquo;{lead.description}&rdquo;</blockquote>
            )}
            <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[0.9375rem] text-muted">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 border-t border-line pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-serif text-xl font-semibold">Why this score</h3>
                <Score value={lead.score} tier={lead.scoreTier} size="lg" />
              </div>
              <ul className="mt-3 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                {lead.scoreFactors.map((factor) => (
                  <li key={factor.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                    <span className="font-semibold">{factor.label}</span>
                    <span className="text-[0.9375rem] tabular-nums text-muted">
                      {factor.points} of {factor.max}
                    </span>
                    <span className="col-span-2 h-1.5 overflow-hidden bg-line">
                      <span className="block h-full bg-rose" style={{ width: `${(factor.points / factor.max) * 100}%` }} />
                    </span>
                    <span className="col-span-2 text-[0.9375rem] leading-snug text-muted">{factor.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[0.9375rem] text-muted">The score is a set of written rules the firm can read and change. No AI model is involved.</p>
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
                  <p className="font-semibold">{check.summary}</p>
                </div>
                <p className="mt-2 text-[0.9375rem] text-muted">Names searched: {check.subjects.map((s) => s.name).join(", ")}.</p>
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
                <p className="mb-4 max-w-[62ch] leading-relaxed text-muted">
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
                {lead.decisionNote && <p className="mt-2 max-w-[62ch] border-l-4 border-line pl-3 text-muted">{lead.decisionNote}</p>}
                {!sent && (
                  <details className="mt-4">
                    <summary className="link inline-flex min-h-11 cursor-pointer items-center">Change the decision</summary>
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
            summary={sent ? "Sent for signature" : document ? "Draft ready to send" : lead.status === "cleared" ? "Filled in from the intake answers" : "Comes after the attorney clears the inquiry"}
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
                  <summary className="link inline-flex min-h-11 cursor-pointer items-center">Read the letter</summary>
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
            summary={signed ? "Signed by the client" : sent ? "Waiting for the client" : "The client will sign online"}
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
                  <div className="demo-note mt-4 max-w-[38rem] p-4">
                    <p className="font-semibold">Play the client</p>
                    <p className="mt-1 text-[0.9375rem] text-muted">A real installation would email the signing link (it is in the outbox). Open it here to sign as {lead.name}.</p>
                    <Link href={`/sign/${signature.request.token}`} prefetch={false} className="btn btn-primary mt-3">
                      Open the signing page
                    </Link>
                  </div>
                )}
              </>
            )}
          </Step>

          <Step n={6} title="Matter opened" state={after(signed && !!matter, false)} summary={matter ? matter.name : "Client and matter will be created in Clio"} last>
            {matter && (
              <>
                <p className="max-w-[62ch] leading-relaxed">
                  The matter is open, and its parties are now part of every future conflict check. These are the two requests that would create the client and
                  the matter in Clio. In this demo they are recorded, not sent.
                </p>
                <div className="mt-3 space-y-2">
                  {clioCalls.map((call) => (
                    <details key={call.id} className="rounded border border-line bg-surface">
                      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">{call.subject}</summary>
                      <pre className="overflow-x-auto border-t border-line bg-salt p-4 text-sm leading-relaxed">{JSON.stringify(call.payload, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              </>
            )}
          </Step>
        </ol>

        <aside aria-label="Messages for this inquiry" className="xl:border-l xl:border-line xl:pl-8">
          <h2 className="font-serif text-xl font-semibold">Messages for this inquiry</h2>
          <p className="mt-1 text-[0.9375rem] leading-snug text-muted">What the firm&apos;s systems would have sent. Nothing leaves this demo.</p>
          <ul className="mt-4 border-t border-line">
            {outbox.map((message) => (
              <li key={message.id} className="border-b border-line">
                <Link href={`/staff/outbox#${message.id}`} className="block py-3 hover:bg-surface">
                  <span className="block text-[0.9375rem] text-muted">
                    <span className="font-semibold text-ink">{OUTBOX_CHANNEL[message.channel]}</span>,{" "}
                    {message.sendAt > ctx.now ? `scheduled ${fmtDateTime(message.sendAt)}` : fmtDateTime(message.createdAt)}
                  </span>
                  <span className="mt-0.5 block leading-snug underline decoration-line underline-offset-4">{message.subject}</span>
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
  done: "border-plum bg-plum text-white",
  current: "border-rose bg-surface text-rose shadow-[0_0_0_4px_var(--color-rose-tint)]",
  waiting: "border-[#8d8698] bg-salt text-muted",
  skipped: "border-line bg-salt text-muted",
};

function Step(props: { n: number; title: string; state: StepState; summary: string; last?: boolean; children?: React.ReactNode }) {
  const { n, title, state, summary, last, children } = props;
  const open = state === "done" || state === "current";
  return (
    <li className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4">
      {!last && <span aria-hidden className={`absolute bottom-0 left-[1.0625rem] top-9 w-0.5 ${state === "done" ? "bg-plum" : "bg-line"}`} />}
      <span className={`relative z-[1] flex size-9 items-center justify-center rounded-full border-2 font-serif font-semibold ${MARKER[state]}`}>{n}</span>
      <div className={last ? "" : "pb-10"}>
        <h2 className={`flex min-h-9 flex-wrap items-baseline gap-x-3 pt-1 ${open ? "" : "text-muted"}`}>
          <span className="font-serif text-[1.375rem] font-semibold leading-tight">{title}</span>
          <span className="text-[0.9375rem] font-normal text-muted">{state === "skipped" ? "Not reached" : summary}</span>
        </h2>
        {open && children && <div className="mt-4">{children}</div>}
      </div>
    </li>
  );
}
