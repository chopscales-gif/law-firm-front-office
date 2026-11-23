import Image from "next/image";
import { Chat } from "@/components/chat";
import { offerSlots, startChat } from "@/lib/chat/engine";
import { CHAT_DISCLAIMER } from "@/lib/chat/guardrail";
import { ADVICE_QUESTIONS, SCENARIOS } from "@/lib/chat/scenarios";
import { FIRM, type Firm } from "@/lib/intake";
import { bookedConsultTimes, unfinishedChat } from "@/server/queries";
import { getCtx } from "@/server/session";

const AREA = { family: { label: "Family", tag: "bg-green-tint text-green" }, estate: { label: "Estate", tag: "bg-lime-tint text-lime" } };

const PRACTICE: { area: keyof typeof AREA; title: string; text: string; start: string }[] = [
  { area: "family", title: "Divorce and separation", text: "Contested or agreed, including property and support.", start: "Start a divorce inquiry" },
  { area: "family", title: "Custody and child support", text: "New orders, and changes to the ones you have.", start: "Start a custody inquiry" },
  { area: "family", title: "Adoption and guardianship", text: "Step-parent adoptions and guardianship of minors.", start: "Start an adoption or guardianship inquiry" },
  { area: "estate", title: "Wills and living trusts", text: "Plans that fit your family, your home and your business.", start: "Start a will or trust inquiry" },
  { area: "estate", title: "Probate", text: "Settling an estate after someone has died.", start: "Start a probate inquiry" },
];

const NEXT_STEPS = [
  "Answer a few questions here. It takes about two minutes.",
  "We check that we have no conflict of interest.",
  `You meet ${FIRM.attorney} for a free 30-minute consultation.`,
  "If we are a good fit, you sign an engagement letter online.",
];

const CONSULTATION = [
  { label: "Length", value: "30 min" },
  { label: "Cost", value: "Free", lit: true },
  { label: "With", value: "An attorney" },
  { label: "Booked", value: "Online" },
];

const NOTES = [
  {
    tag: "The assistant",
    look: "bg-green-tint text-green",
    wash: "to-mint",
    title: "It takes your details. It does not give legal advice.",
    text: "Ask it a legal question and it will say so, then carry on with booking you a consultation with an attorney.",
  },
  {
    tag: "Conflicts",
    look: "bg-lime-tint text-lime",
    wash: "to-lime-tint",
    title: "We check for a conflict before anyone discusses your matter.",
    text: "If the firm already acts for the other side, an attorney reviews it before anything else happens.",
  },
  {
    tag: "Becoming a client",
    look: "bg-amber-tint text-amber",
    wash: "to-amber-tint",
    title: "You are a client only after you sign an engagement letter.",
    text: "Chatting here, or booking a consultation, does not create that relationship.",
  },
];

/** The page's column: wide margins, the same on every section. */
const WRAP = "mx-auto w-full max-w-[82rem] px-5 sm:px-8";
const SECTION = `${WRAP} scroll-mt-4 pb-[clamp(3.5rem,8vw,7rem)]`;

export default async function Home() {
  // Seeds the visitor's sample data now, so the first chat message is not the slow one.
  const ctx = await getCtx();
  const { firm } = ctx;
  const opening = startChat(offerSlots(ctx.now, await bookedConsultTimes(ctx)), firm);
  const unfinished = await unfinishedChat(ctx);

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      {/* The first screen sits on a photograph of a bright room, under a white wash so the type stays readable. */}
      <div className="relative isolate bg-stone">
        <Image src="/photos/room.jpg" alt="" fill preload sizes="100vw" className="-z-20 object-cover object-[50%_40%]" />
        <div aria-hidden className="hero-wash absolute inset-0 -z-10" />

        <header className={`${WRAP} flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-5`}>
          <p className="min-w-0 font-serif text-[1.5625rem] leading-none tracking-[-0.01em] [overflow-wrap:anywhere]">{firm.name}</p>
          <nav aria-label="On this page" className="hidden gap-1.5 text-[0.9375rem] font-medium md:flex">
            {[
              ["#practice", "Practice areas"],
              ["#how-it-works", "How it works"],
              ["#good-to-know", "Good to know"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-1.5 hover:bg-white/80">
                {label}
              </a>
            ))}
          </nav>
          <a href={`tel:${FIRM.phone.replace(/\D/g, "")}`} className="btn btn-quiet btn-small">
            <span className="hidden sm:inline">Call</span> {FIRM.phone}
          </a>
        </header>

        <main className={`${WRAP} grid items-center gap-[clamp(2rem,6vw,6rem)] pb-[clamp(4.5rem,9vw,8.5rem)] pt-[clamp(1.5rem,4vw,3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,32.5rem)]`}>
          <div>
            <h1 className="display text-[clamp(2.5rem,5vw,4.125rem)]">
              Family law and estate planning, <span className="accent">without the runaround.</span>
            </h1>
            <p className="mt-6 max-w-[42ch] text-lg text-[#3a4441]">
              Tell us what is going on and we will book you a free consultation with an attorney. No forms to print, no phone tag.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              <a href="#inquiry" className="btn btn-primary lg:hidden">
                Start your inquiry
              </a>
              <a href="#how-it-works" className="btn btn-quiet">
                See how it works
              </a>
            </div>
          </div>
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
      </div>

      <section id="practice" className={`${SECTION} pt-[clamp(3.5rem,8vw,7rem)]`}>
        <Opener label="Practice areas">
          Help with family <span className="accent">and what you leave them</span>
        </Opener>
        <div className="grid items-center gap-[clamp(2rem,7vw,7.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <ul className="grid max-w-[32.5rem] gap-3">
            {PRACTICE.map((item, i) => (
              <li key={item.title}>
                <details name="practice" open={i === 0} className="group -mx-3 rounded-2xl px-3 py-3 open:bg-surface open:shadow-lift sm:-mx-5 sm:px-5 sm:open:py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className={`tag ${AREA[item.area].tag}`}>{AREA[item.area].label}</span>
                      <span role="heading" aria-level={3} className="mt-2 block text-[1.4375rem] leading-snug tracking-[-0.02em]">
                        {item.title}
                      </span>
                    </span>
                    <span aria-hidden className="mt-0.5 grid size-[1.875rem] shrink-0 place-items-center rounded-full border border-edge text-lg leading-none">
                      <span className="group-open:hidden">+</span>
                      <span className="hidden group-open:inline">&minus;</span>
                    </span>
                  </summary>
                  <p className="mt-1.5 text-muted">{item.text}</p>
                  <a href="#inquiry" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-fern">
                    {item.start} <span aria-hidden>&rarr;</span>
                  </a>
                </details>
              </li>
            ))}
          </ul>
          <div>
            <figure className="relative aspect-square overflow-hidden rounded-3xl bg-stone">
              <Image
                src="/photos/hand.jpg"
                alt="A young child holding an adult's hand in warm evening light"
                fill
                sizes="(min-width: 64rem) 30rem, 100vw"
                className="object-cover object-[60%_22%]"
              />
            </figure>
            <div className="sheet relative mx-3 -mt-[4.5rem] grid gap-3 p-5 sm:mx-5 sm:p-6">
              <h3 className="eyebrow">Your first consultation</h3>
              <dl className="grid grid-cols-2 gap-3">
                {CONSULTATION.map((item) => (
                  <div key={item.label} className={`grid gap-2.5 rounded-[0.875rem] border px-4 pb-3 pt-3.5 shadow-rest ${item.lit ? "border-[#e2ee9e] bg-lime-tint" : "border-line"}`}>
                    <dt className="text-sm text-muted">{item.label}</dt>
                    <dd className="figure text-[1.625rem] sm:text-3xl">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <a href="#inquiry" className="btn btn-primary mt-2 justify-self-center">
                Book a consultation
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className={SECTION}>
        <Opener label="How it works">
          From first question <span className="accent">to signed letter</span>
        </Opener>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NEXT_STEPS.map((step, i) => (
            <li key={step} className="panel grid content-between gap-6 p-[1.375rem]">
              <span className="figure text-[2.75rem] text-fern">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className={SECTION}>
        <figure className="relative h-[clamp(15rem,36vw,32.5rem)] overflow-hidden rounded-3xl bg-stone">
          <Image
            src="/photos/walk.jpg"
            alt="A parent and a small child walking hand in hand along a sunlit, tree-lined path"
            fill
            sizes="(min-width: 82rem) 78rem, 100vw"
            className="object-cover object-[50%_62%]"
          />
        </figure>
      </div>

      <section id="good-to-know" className={SECTION}>
        <Opener label="Good to know">
          Plain about <span className="accent">what this is</span>
        </Opener>
        <ul className="grid gap-5 lg:grid-cols-3">
          {NOTES.map((note) => (
            <li key={note.tag} className={`grid content-start justify-items-start gap-3.5 rounded-[1.25rem] border border-line bg-gradient-to-br from-surface from-35% p-[1.625rem] ${note.wash}`}>
              <span className={`tag ${note.look}`}>{note.tag}</span>
              <h3 className="font-serif text-2xl leading-tight tracking-[-0.01em]">{note.title}</h3>
              <p className="text-muted">{note.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${SECTION} grid items-center gap-[clamp(2rem,6vw,6rem)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}>
        <figure className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-stone">
          <Image
            src="/photos/path.jpg"
            alt="A grandparent walking a forest path with an arm around a child, two smaller children running ahead"
            fill
            sizes="(min-width: 64rem) 42rem, 100vw"
            className="object-cover"
          />
        </figure>
        <div>
          <p className="eyebrow">When you are ready</p>
          <h2 className="display mt-3 text-[clamp(2rem,3.5vw,2.875rem)]">
            Tell us what is going on. <span className="accent">We will take it from there.</span>
          </h2>
          <p className="mb-7 mt-4 max-w-[44ch] text-lg text-muted">Two minutes with the intake assistant, then a free consultation with an attorney.</p>
          <a href="#inquiry" className="btn btn-primary">
            Start your inquiry
          </a>
        </div>
      </section>

      <footer className="border-t border-line">
        <FictionNote firm={firm} className={`${WRAP} pb-11 pt-7 text-muted`} />
      </footer>
    </div>
  );
}

/** How every section opens: a small grey label, then a light headline with one phrase in the serif. */
function Opener({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[clamp(2rem,4.5vw,3.75rem)] grid justify-items-center gap-3.5 text-center">
      <p className="eyebrow">{label}</p>
      <h2 className="display text-[clamp(2rem,3.5vw,2.875rem)]">{children}</h2>
    </div>
  );
}

/**
 * The small print at the foot of the page. A name the visitor typed belongs to
 * a real firm, so the note then says what is invented and never that the firm is.
 */
function FictionNote({ firm, className }: { firm: Firm; className: string }) {
  return (
    <div className={className}>
      <p className="max-w-[74ch] text-sm leading-relaxed [overflow-wrap:anywhere]">
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
        )}{" "}
        Photographs are stock images from Unsplash. The people and the room shown are not the firm&apos;s clients, staff or offices.
      </p>
    </div>
  );
}
