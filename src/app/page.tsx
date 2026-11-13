import { Chat } from "@/components/chat";
import { offerSlots, startChat } from "@/lib/chat/engine";
import { CHAT_DISCLAIMER } from "@/lib/chat/guardrail";
import { SCENARIOS } from "@/lib/chat/scenarios";
import { FIRM } from "@/lib/intake";
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
  const { now } = await getCtx();
  const opening = startChat(offerSlots(now));

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <p className="font-serif text-2xl leading-none">{FIRM.name}</p>
          <p className="text-sm text-muted">
            <span className="hidden sm:inline">Call us on </span>
            <span className="font-semibold text-ink">{FIRM.phone}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-x-12 gap-y-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-14">
        <div>
          <h1 className="font-serif text-4xl leading-[1.1] sm:text-5xl">Family law and estate planning in Salt Lake City.</h1>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted">
            Tell us what is going on and we will book you a free consultation with an attorney. No forms to print, no phone tag.
          </p>

          <div className="mt-10 hidden lg:block">
            <FirmDetails />
          </div>
        </div>

        <Chat
          opening={opening.replies.map((text) => ({ role: "assistant", text }))}
          openingSuggestions={opening.suggestions}
          disclaimer={CHAT_DISCLAIMER}
          scenarios={SCENARIOS}
        />

        <div className="lg:hidden">
          <FirmDetails />
        </div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm leading-relaxed text-muted sm:px-6">
          <p>
            {FIRM.name}, {FIRM.address}. {FIRM.phone}.
          </p>
          <p className="mt-1">
            {FIRM.name} is a fictional firm created for this demonstration. No legal services are offered here, and nothing on this site is legal advice.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FirmDetails() {
  return (
    <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <section>
        <h2 className="font-serif text-xl">What we handle</h2>
        <dl className="mt-3 space-y-3">
          {PRACTICE.map((item) => (
            <div key={item.title}>
              <dt className="font-semibold">{item.title}</dt>
              <dd className="text-[0.9375rem] text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="font-serif text-xl">What happens next</h2>
        <ol className="mt-3 space-y-3">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-juniper-tint text-sm font-semibold text-juniper-deep">{i + 1}</span>
              <span className="text-[0.9375rem] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
