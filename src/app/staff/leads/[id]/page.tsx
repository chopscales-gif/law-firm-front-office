import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { DecisionForm } from "@/components/decision-form";
import { Flash } from "@/components/flash";
import { PhoneSigning } from "@/components/handoff";
import { HitList } from "@/components/hit-list";
import { Letter } from "@/components/letter";
import { OUTCOME, OutcomeChip, STAGE, Score, StatusChip } from "@/components/ui";
import { formatSlot } from "@/lib/chat/engine";
import { fmtDateTime } from "@/lib/format";
import { SOURCE_LABEL, URGENCY_LABEL, firmOnLetter, matterLabel } from "@/lib/intake";
import { createLetterAction, runCheckAction, sendForSignatureAction } from "@/server/actions";
import { findLead, matterForLead, outboxFor, signatureFor } from "@/server/queries";
import { getCtx } from "@/server/session";
import { getDocument, latestCheck } from "@/server/workflow";

export const metadata: Metadata = { title: "Inquiry" };

type StepState = "done" | "current" | "waiting" | "skipped" | "held" | "declined";

const CHANNEL = { chat: "Website chat", form: "Website form", phone: "Phone call" };
const OUTBOX_CHANNEL = { email: "Email", sms: "Text", clio: "Clio" };
const OUTBOX_TAG = { email: "bg-mint text-forest", sms: "bg-plum-tint text-plum", clio: "bg-amber-tint text-amber" };

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
  // A letter is a record: it keeps the firm name it was written with, even if the visitor has since changed the name on the demo.
  const letterFirm = document ? firmOnLetter(document.fields.firmName) : ctx.firm;
  const consultAhead = lead.consultAt !== null && new Date(lead.consultAt) > ctx.now;

  return (
    <>
      <p className="flex min-h-11 items-center gap-2 text-[0.9375rem] text-muted lg:min-h-0">
        <Link href="/staff" className="hover:text-ink hover:underline hover:underline-offset-4">
          <span className="sr-only">Back to </span>Inquiries
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{lead.name}</span>
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <h1 className="display text-[clamp(2.125rem,4.2vw,3.5rem)] [overflow-wrap:anywhere]">
            {lead.name}, <span className="accent">{STAGE[lead.status].label.toLowerCase()}</span>
          </h1>
          <p className="mt-3 text-lg text-muted">
            {matterLabel(lead.matterType)} <span aria-hidden>&middot;</span> {CHANNEL[lead.channel]}, {fmtDateTime(lead.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-1">
          <Score value={lead.score} tier={lead.scoreTier} size="lg" />
          <Flash value={lead.status}>
            <StatusChip status={lead.status} size="lg" />
          </Flash>
        </div>
      </div>
      {lead.safetyConcern && (
        <p className="mt-6 rounded-2xl border border-[#f3cfc9] bg-gradient-to-r from-flag-tint to-[#fff5f0] to-70% px-5 py-4 leading-relaxed">
          <strong className="font-semibold text-flag">Safety concern.</strong> This person mentioned threats or danger. The assistant gave them the emergency numbers, and this
          inquiry stays at the top of the list until someone acts on it.
        </p>
      )}

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <ol className="space-y-4">
          <Step n={1} title="Intake" state="done" summary={`Scored ${lead.score} of 100`}>
            {lead.description && (
              <blockquote className="rounded-2xl bg-stone px-6 py-5 font-serif text-[1.375rem] leading-[1.4] tracking-[-0.005em]">&ldquo;{lead.description}&rdquo;</blockquote>
            )}
            <dl className="mt-5 grid gap-x-10 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[8.125rem_minmax(0,1fr)] gap-4 border-b border-line py-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className="break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-7 rounded-2xl border border-line px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <h3 className="text-lg font-semibold">Why this score</h3>
                <Score value={lead.score} tier={lead.scoreTier} size="lg" />
              </div>
              <ul className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {lead.scoreFactors.map((factor) => (
                  <li key={factor.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                    <span className="font-semibold">{factor.label}</span>
                    <span className="text-[0.9375rem] font-semibold tabular-nums">
                      {factor.points} of {factor.max}
                    </span>
                    <span className="col-span-2 h-2 overflow-hidden rounded-full bg-stone">
                      <span className="block h-full rounded-full bg-fern" style={{ width: `${(factor.points / factor.max) * 100}%` }} />
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
                <div data-story="check-result" className={`rounded-2xl border px-5 py-4 ${OUTCOME[check.outcome].box}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <OutcomeChip outcome={check.outcome} />
                    <p className="font-serif text-xl leading-snug">{check.summary}</p>
                  </div>
                  <p className="mt-2 text-[0.9375rem]">Names searched: {check.subjects.map((s) => s.name).join(", ")}.</p>
                </div>
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
                <ActionButton action={runCheckAction.bind(null, lead.id)} pendingLabel="Checking" story="run-check">
                  Run conflict check
                </ActionButton>
              </>
            )}
          </Step>

          <Step
            n={3}
            title="Attorney decision"
            state={decided ? (lead.status === "flagged" ? "held" : lead.status === "declined" ? "declined" : "done") : check ? "current" : "waiting"}
            summary={decided && lead.decidedAt ? `Decided ${fmtDateTime(lead.decidedAt)}` : check ? "Waiting for a decision" : "After the conflict check"}
          >
            {decided ? (
              <>
                <p
                  className={`rounded-2xl border px-5 py-3.5 text-[1.0625rem] font-semibold ${
                    lead.status === "flagged" ? "border-[#f6d3b8] bg-amber-tint" : lead.status === "declined" ? "border-line bg-stone" : "border-[#bfe6dc] bg-green-tint"
                  }`}
                >
                  {lead.status === "flagged" ? "Held for attorney review." : lead.status === "declined" ? "Declined. A declination email is in the outbox." : "Cleared to proceed."}
                </p>
                {lead.decisionNote && (
                  <div className="mt-3 max-w-[62ch] rounded-2xl bg-stone px-4 py-3">
                    <p className="eyebrow">Note for the file</p>
                    <p className="mt-0.5">{lead.decisionNote}</p>
                  </div>
                )}
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
            summary={signed ? "Sent and signed" : sent ? "Sent for signature" : document ? "Draft ready to send" : lead.status === "cleared" ? "Filled in from the intake answers" : "Comes after the attorney clears the inquiry"}
          >
            {lead.status === "cleared" && (consultAhead || !lead.consultAt) && (
              <p className="demo-note mb-4 max-w-[38rem] px-4 py-3 text-[0.9375rem] leading-relaxed">
                {consultAhead
                  ? `The consultation is booked for ${formatSlot(lead.consultAt!)}. A firm would send this letter after that meeting. The demo lets you send it now, so you can follow one inquiry to the end.`
                  : "No consultation has been held yet. A firm would send this letter after meeting the client. The demo lets you send it now, so you can follow one inquiry to the end."}
              </p>
            )}
            {lead.status === "cleared" && !document && (
              <ActionButton action={createLetterAction.bind(null, lead.id)} pendingLabel="Preparing" story="prepare-letter">
                Prepare engagement letter
              </ActionButton>
            )}
            {document && (
              <>
                {lead.status === "cleared" && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <ActionButton action={sendForSignatureAction.bind(null, lead.id)} pendingLabel="Sending" story="send-letter">
                      Send for signature
                    </ActionButton>
                    <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn btn-quiet">
                      Open as PDF
                    </a>
                  </div>
                )}
                <details open={lead.status === "cleared"}>
                  <summary className="link inline-flex min-h-11 cursor-pointer items-center">Read the letter</summary>
                  <div data-story="letter" className="mt-3 scroll-mt-4">
                    <Letter firm={letterFirm} blocks={document.blocks} />
                  </div>
                </details>
                {letterFirm.name !== ctx.firm.name && (
                  <p className="demo-note mt-3 max-w-[38rem] px-4 py-3 text-[0.9375rem] leading-relaxed">
                    This letter was written before the firm name on the demo was changed, so it keeps the name it was written with, as a letter already sent would.
                  </p>
                )}
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
                <ul className="overflow-hidden rounded-2xl border border-line">
                  {signature.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap gap-x-4 border-b border-line px-4 py-2.5 last:border-b-0 odd:bg-stone">
                      <span className="w-40 shrink-0 text-[0.9375rem] tabular-nums text-muted">{fmtDateTime(event.at)}</span>
                      <span className="font-semibold">{event.label}</span>
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/sign/${signature.request.token}`} prefetch={false} data-story="open-signing" className="btn btn-primary">
                        Open the signing page
                      </Link>
                      <PhoneSigning path={`/sign/${signature.request.token}`} signerName={lead.name} />
                    </div>
                  </div>
                )}
              </>
            )}
          </Step>

          <Step n={6} title="Matter opened" state={after(signed && !!matter, false)} summary={matter ? matter.name : "Client and matter will be created in Clio"} last>
            {matter && (
              <>
                <p data-story="matter" className="max-w-[62ch] scroll-mt-4 leading-relaxed">
                  The matter is open, and its parties are now part of every future conflict check. These are the two requests that would create the client and
                  the matter in Clio. In this demo they are recorded, not sent.
                </p>
                <div className="mt-3 space-y-2">
                  {clioCalls.map((call) => (
                    <details key={call.id} className="rounded-xl border border-line bg-surface">
                      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold">{call.subject}</summary>
                      <pre className="overflow-x-auto border-t border-line bg-stone p-4 text-sm leading-relaxed">{JSON.stringify(call.payload, null, 2)}</pre>
                    </details>
                  ))}
                </div>
                <p className="demo-note mt-5 max-w-[38rem] px-4 py-3 text-[0.9375rem] leading-relaxed">
                  That is the whole path, from a first message to an open matter.{" "}
                  <Link href="/about" className="link">
                    What you just saw, and what a real version connects to
                  </Link>
                  .
                </p>
              </>
            )}
          </Step>
        </ol>

        <aside aria-label="Messages for this inquiry" className="panel overflow-hidden xl:sticky xl:top-4">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">
              Messages <span className="sr-only">for this inquiry</span>
              <span className="ml-1.5 font-normal tabular-nums text-faint">{outbox.length}</span>
            </h2>
            <p className="mt-1 text-[0.9375rem] leading-snug text-muted">What the firm&apos;s systems would have sent. Nothing leaves this demo.</p>
          </div>
          <ul>
            {outbox.map((message) => (
              <li key={message.id} className="border-b border-line last:border-b-0">
                <Link href={`/staff/outbox#${message.id}`} className="block px-5 py-3.5 hover:bg-stone">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-muted">
                    <span className={`tag ${OUTBOX_TAG[message.channel]}`}>{OUTBOX_CHANNEL[message.channel]}</span>
                    {message.sendAt > ctx.now ? `Scheduled ${fmtDateTime(message.sendAt)}` : fmtDateTime(message.createdAt)}
                  </span>
                  <span className="mt-1.5 block font-semibold leading-snug">{message.subject}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

const STEP: Record<StepState, { card: string; marker: string; tag: string; label: string }> = {
  done: { card: "panel", marker: "bg-green-tint text-green", tag: "bg-green-tint text-green", label: "Done" },
  current: { card: "rounded-2xl border border-mint-strong bg-surface shadow-lift", marker: "bg-forest text-white", tag: "bg-forest text-white", label: "Next step" },
  held: { card: "rounded-2xl border border-[#f6d3b8] bg-surface shadow-lift", marker: "bg-amber-tint text-amber", tag: "bg-amber-tint text-amber", label: "On hold" },
  declined: { card: "panel", marker: "bg-stone text-[#565d5a]", tag: "bg-stone text-[#565d5a]", label: "Declined" },
  waiting: { card: "rounded-2xl border border-dashed border-edge", marker: "bg-stone text-muted", tag: "bg-stone text-[#565d5a]", label: "Waiting" },
  skipped: { card: "rounded-2xl border border-dashed border-edge", marker: "bg-stone text-muted", tag: "bg-stone text-[#565d5a]", label: "Not reached" },
};

/** One stage of the inquiry on its own card: mint once done, lifted off the page when it is the next thing to do, peach while held, an outline until its turn. */
function Step(props: { n: number; title: string; state: StepState; summary: string; last?: boolean; children?: React.ReactNode }) {
  const { n, title, state, summary, children } = props;
  const open = state !== "waiting" && state !== "skipped";
  const look = STEP[state];
  return (
    <li className={`overflow-hidden ${look.card}`}>
      <h2 className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 px-5 py-4 sm:px-6 ${state === "current" ? "bg-gradient-to-r from-mint to-surface to-80%" : state === "held" ? "bg-gradient-to-r from-amber-tint to-surface to-80%" : ""}`}>
        <span className={`figure flex size-9 shrink-0 items-center justify-center rounded-full text-lg ${look.marker}`}>
          {state === "done" ? (
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[2.5]">
              <path d="M3 8.5l3.2 3.2L13 4.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            n
          )}
        </span>
        <span className={`text-xl font-medium leading-tight tracking-[-0.01em] ${open ? "" : "text-muted"}`}>
          <span className="sr-only">Step {n}: </span>
          {title}
        </span>
        <span className="min-w-0 flex-1 basis-40 text-[0.9375rem] font-normal text-muted">
          <Flash value={state === "skipped" ? "Not reached" : summary}>{state === "skipped" ? "" : summary}</Flash>
        </span>
        <span className={`tag ${look.tag}`}>{look.label}</span>
      </h2>
      {open && children && <div className="border-t border-line px-5 py-6 sm:px-6">{children}</div>}
    </li>
  );
}
