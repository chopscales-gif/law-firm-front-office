import { Chat } from "@/components/chat";
import { offerSlots, startChat } from "@/lib/chat/engine";
import { CHAT_DISCLAIMER } from "@/lib/chat/guardrail";
import { ADVICE_QUESTIONS, SCENARIOS } from "@/lib/chat/scenarios";
import { FIRM, type Firm } from "@/lib/intake";
import { bookedConsultTimes, unfinishedChat } from "@/server/queries";
import { getCtx } from "@/server/session";

const PRACTICE = [
  { title: "Divorce and separation", text: "Contested or agreed, including property and support." },
  { title: "Custody and child support", text: "New orders, and changes to the ones you have." },
  { title: "Adoption and guardianship", text: "Step-parent adoptions and guardianship of minors." },
  { title: "Wills and living trusts", text: "Plans that fit your family, your home and your business." },
  { title: "Probate", text: "Settling an estate after someone has died." },
];

const NEXT_STEPS = [
  "Answer a few questions here. It takes about two minutes.",
  "We check that we have no conflict of interest.",
  `You meet ${FIRM.attorney} for a free 30-minute consultation.`,
  "If we are a good fit, you sign an engagement letter online.",
];

export default async function Home() {
  // Seeds the visitor's sample data now, so the first chat message is not the slow one.
  const ctx = await getCtx();
  const { firm } = ctx;
  const opening = startChat(offerSlots(ctx.now, await bookedConsultTimes(ctx)), firm);
  const unfinished = await unfinishedChat(ctx);

  return (
    <div className="flex flex-1 flex-col bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,32.5rem)] lg:gap-x-[clamp(2.5rem,5vw,4.5rem)] lg:px-[clamp(2.5rem,6vw,5.5rem)]">
      <div className="flex min-w-0 flex-col">
        {/* The firm speaking in its own voice. On a laptop this fills the window beside the inquiry sheet. */}
        <div className="flex flex-col px-4 sm:px-6 lg:min-h-[max(35rem,calc(100svh-var(--demo-bar-h,3rem)))] lg:px-0">
          <header className="flex flex-wrap items-baseline justify-between gap-x-6 pt-5 lg:pt-10">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-4">
              <span className="min-w-0 font-serif text-2xl leading-tight text-petrol [overflow-wrap:anywhere]">{firm.name}</span>
              <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.14em] text-muted">Attorneys at law</span>
            </p>
            <p className="shrink-0 text-[0.9375rem] text-muted">
              <span className="hidden sm:inline">Call </span>
              <a href={`tel:${FIRM.phone.replace(/\D/g, "")}`} className="inline-flex min-h-11 items-center font-semibold text-petrol underline decoration-petrol/40 underline-offset-4">
                {FIRM.phone}
              </a>
            </p>
          </header>

          <div className="my-auto py-8 lg:py-10">
            <h1 className="text-balance font-serif text-[2.75rem] leading-[1.02] tracking-[-0.03em] text-petrol sm:text-6xl lg:text-[clamp(3.25rem,min(6.4vw,11.5svh),5.75rem)] lg:leading-none lg:tracking-[-0.035em]">
              Family law and estate planning, <em className="text-lake">without the runaround.</em>
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed lg:mt-7 lg:text-xl lg:leading-[1.5]">
              Tell us what is going on and we will book you a free consultation with an attorney. No forms to print, no phone tag.
            </p>
          </div>

          <ul className="hidden flex-wrap gap-x-10 gap-y-1 border-t border-petrol pb-8 pt-5 text-[0.9375rem] lg:flex">
            {PRACTICE.map((item) => (
              <li key={item.title}>{item.title}</li>
            ))}
          </ul>
        </div>

        <div className="hidden border-t border-petrol/25 pb-14 pt-10 lg:block">
          <FirmDetails />
          <FictionNote firm={firm} className="mt-10 max-w-[62ch] text-muted" />
        </div>
      </div>

      <main className="flex min-w-0 flex-col px-4 pb-6 sm:px-6 lg:sticky lg:top-0 lg:h-[calc(100svh-var(--demo-bar-h,3rem))] lg:min-h-[35rem] lg:px-0 lg:pb-5 lg:pt-10 short:pt-5">
        <Chat
          firmName={firm.name}
          opening={opening.replies.map((text) => ({ role: "assistant", text }))}
          openingSuggestions={opening.suggestions}
          disclaimer={CHAT_DISCLAIMER}
          scenarios={SCENARIOS}
          adviceQuestions={ADVICE_QUESTIONS}
          restored={unfinished && { sessionId: unfinished.id, messages: unfinished.messages, suggestions: unfinished.suggestions }}
        />
      </main>

      <div className="border-t border-petrol/25 px-4 py-8 sm:px-6 lg:hidden">
        <FirmDetails />
        <FictionNote firm={firm} className="mt-8 text-muted" />
      </div>
    </div>
  );
}

/**
 * The small print under the firm's details. A name the visitor typed belongs to
 * a real firm, so the note then says what is invented and never that the firm is.
 */
function FictionNote({ firm, className }: { firm: Firm; className: string }) {
  return (
    <p className={`text-sm leading-relaxed [overflow-wrap:anywhere] ${className}`}>
      {firm.custom ? (
        <>
          This is a demonstration build. The name {firm.name} is shown because it was typed into this demo. The address, the phone number, the attorney
          and every client are invented. No legal services are offered here, and nothing on this site is legal advice.
        </>
      ) : (
        <>
          {firm.name}, {firm.address}. {firm.name} is a fictional firm created for this demonstration. No legal services are offered here, and nothing on
          this site is legal advice.
        </>
      )}
    </p>
  );
}

function FirmDetails() {
  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      <section>
        <h2 className="font-serif text-xl text-petrol">What we handle</h2>
        <dl className="mt-3 space-y-2.5">
          {PRACTICE.map((item) => (
            <div key={item.title}>
              <dt className="font-semibold leading-snug">{item.title}</dt>
              <dd className="text-[0.9375rem] leading-snug text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="font-serif text-xl text-petrol">What happens next</h2>
        <ol className="mt-3 space-y-3">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
              <span className="font-serif text-lg leading-snug text-lake">{i + 1}</span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
