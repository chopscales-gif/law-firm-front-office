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
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The spine: the firm speaking in its own voice. It carries the same petrol as the rail on the firm side. */}
      <div className="on-dark relative isolate flex flex-col overflow-hidden bg-petrol text-white">
        {/* The ampersand is Alder & Finch's own mark, so it goes when a visitor's firm name is showing. */}
        {!firm.custom && (
          <span aria-hidden className="pointer-events-none absolute -right-[0.1em] top-[0.02em] -z-10 hidden select-none font-serif text-[34rem] font-semibold italic leading-none text-petrol-deep lg:block">
            &amp;
          </span>
        )}
        <header className="flex items-baseline justify-between gap-4 px-4 pt-5 sm:px-6 lg:px-10 lg:pt-8">
          <p className="min-w-0 font-serif text-[1.375rem] font-semibold leading-tight [overflow-wrap:anywhere]">{firm.name}</p>
          <p className="shrink-0 text-[0.9375rem] text-white/85">
            <span className="hidden sm:inline">Call </span>
            <a href={`tel:${FIRM.phone.replace(/\D/g, "")}`} className="inline-flex min-h-11 items-center font-semibold text-white underline decoration-white/40 underline-offset-4">
              {FIRM.phone}
            </a>
          </p>
        </header>

        <div className="px-4 pb-8 pt-8 sm:px-6 lg:px-10 lg:pb-10 lg:pt-[clamp(2.5rem,9vh,6rem)]">
          <h1 className="max-w-[16ch] text-balance font-serif text-[2.5rem] font-medium leading-[1.04] tracking-[-0.015em] sm:text-6xl lg:text-[min(4vw,4rem)]">
            Family law and estate planning in Salt Lake City.
          </h1>
          <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-white/85 lg:text-xl">
            Tell us what is going on and we will book you a free consultation with an attorney. No forms to print, no phone tag.
          </p>
        </div>

        <div className="mt-auto hidden px-10 pb-8 lg:block">
          <FirmDetails dark />
          <FictionNote firm={firm} className="mt-10 max-w-[62ch] text-white/75" />
        </div>
      </div>

      <main className="flex min-w-0 flex-col px-4 py-5 sm:px-6 lg:sticky lg:top-0 lg:h-[calc(100svh-var(--demo-bar-h,6.5rem))] lg:min-h-[35rem] lg:px-10 lg:py-5 short:py-3">
        <Chat
          opening={opening.replies.map((text) => ({ role: "assistant", text }))}
          openingSuggestions={opening.suggestions}
          disclaimer={CHAT_DISCLAIMER}
          scenarios={SCENARIOS}
          adviceQuestions={ADVICE_QUESTIONS}
          restored={unfinished && { sessionId: unfinished.id, messages: unfinished.messages, suggestions: unfinished.suggestions }}
        />
      </main>

      <div className="border-t border-line px-4 py-8 sm:px-6 lg:hidden">
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

function FirmDetails({ dark = false }: { dark?: boolean }) {
  const quiet = dark ? "text-white/75" : "text-muted";
  return (
    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      <section>
        <h2 className="font-serif text-lg font-semibold">What we handle</h2>
        <dl className="mt-3 space-y-2.5">
          {PRACTICE.map((item) => (
            <div key={item.title}>
              <dt className="font-semibold leading-snug">{item.title}</dt>
              <dd className={`text-[0.9375rem] leading-snug ${quiet}`}>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="font-serif text-lg font-semibold">What happens next</h2>
        <ol className="mt-3 space-y-3">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
              <span className={`font-serif text-lg font-semibold leading-snug ${dark ? "text-lake-pale" : "text-lake"}`}>{i + 1}</span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
