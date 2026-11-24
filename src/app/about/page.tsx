import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About this demo" };

const SAW = [
  "A new client explained what they needed in a chat, at any hour, and was booked for a consultation without anyone at the office picking up a phone.",
  "The inquiry reached the firm already scored and summarized, and one click checked every name in it against the firm's files, including nicknames, former names and misspellings.",
  "An attorney made the decision. The software found the matches and recorded the decision. It did not make it.",
  "The engagement letter was filled in from the intake answers, signed on a phone, and the matter was opened with nothing typed twice.",
];

const CONNECTS = [
  { to: "Your practice management system", what: "New clients and matters are created there, so nobody re-enters them. The demo shows the requests it would send to Clio, as one example." },
  { to: "Your calendar", what: "Consultations are offered from the attorney's real free time and booked straight into it." },
  { to: "Email and text messaging", what: "Confirmations, reminders and signing links go out from the firm's own address and number. In the demo they stop at the outbox." },
  { to: "E-signature record keeping", what: "The signed letter and its record of who signed, when and how are filed with the matter." },
];

const contactLink = "link [overflow-wrap:anywhere]";

/**
 * The closing screen. Unlike every other page, this one is ChopMedia speaking,
 * not the firm, so it closes on a panel of its own and makes no claim
 * the demo cannot back: no clients, no numbers, no integrations said to exist.
 */
export default function AboutPage() {
  return (
    <main className="w-full flex-1">
      <div className="mx-auto w-full max-w-[64rem] px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
        <p className="eyebrow">A demonstration build by ChopMedia</p>
        <h1 className="display mt-3 text-[clamp(2.5rem,5vw,4.125rem)]">
          What you <span className="accent">just saw</span>
        </h1>
        <ol className="mt-7 max-w-[70ch] space-y-3.5">
          {SAW.map((line, i) => (
            <li key={line} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2 text-lg leading-relaxed">
              <span className="figure pt-1 text-2xl text-fern">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-x-12 gap-y-10 border-t border-line pt-10 lg:grid-cols-2">
          <section>
            <h2 className="font-serif text-2xl font-normal leading-tight">What a real version would connect to</h2>
            <p className="mt-2 leading-relaxed text-muted">
              Nothing here is connected to anything. Built for a firm, the same steps would be wired to the systems that firm already uses.
            </p>
            <dl className="mt-4 space-y-4">
              {CONNECTS.map((item) => (
                <div key={item.to}>
                  <dt className="font-semibold">{item.to}</dt>
                  <dd className="leading-relaxed text-muted">{item.what}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2 className="font-serif text-2xl font-normal leading-tight">What is recorded here, and what would be live</h2>
            <p className="mt-2 leading-relaxed text-muted">No AI model runs in this demo, so it behaves the same way for every visitor.</p>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="font-semibold">The intake assistant</dt>
                <dd className="leading-relaxed text-muted">
                  Here it follows written rules and scripted replies. In a real build a live AI model would hold the conversation, inside the same limits.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">The score and the conflict search</dt>
                <dd className="leading-relaxed text-muted">
                  Written rules here, and written rules in a real build. A firm should be able to read exactly why a name matched or an inquiry scored as it
                  did.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Legal advice</dt>
                <dd className="leading-relaxed text-muted">
                  The assistant does not give legal advice, recorded or live. It says so, declines the question, and passes the person to the firm.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <section className="mx-auto w-full max-w-[64rem] px-5 pb-16 sm:px-8">
        <div className="rounded-3xl border border-line bg-gradient-to-br from-surface from-30% to-mint px-6 py-9 sm:px-10 sm:py-12">
          <h2 className="display max-w-[24ch] text-[clamp(1.75rem,3.5vw,2.875rem)]">
            Want to see it run <span className="accent">on one of your own documents or inquiries?</span>
          </h2>
          <p className="mt-3 max-w-[58ch] text-lg leading-relaxed text-muted">Send one and I will run it live on a call.</p>
          <p className="mt-6 max-w-[58ch] leading-relaxed text-muted">ChopMedia is Hayden Huelskamp, an engineer based in Utah.</p>
          <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted">Email</dt>
            <dd>
              <a href="mailto:chopscales@gmail.com" className={contactLink}>
                chopscales@gmail.com
              </a>
            </dd>
            <dt className="text-muted">LinkedIn</dt>
            <dd>
              <a href="https://www.linkedin.com/in/hayden-huelskamp-547a86302/" className={contactLink}>
                linkedin.com/in/hayden-huelskamp-547a86302
              </a>
            </dd>
            <dt className="text-muted">The other four demos</dt>
            <dd>
              <a href="https://haydenhuelskamp.com" className={contactLink}>
                haydenhuelskamp.com
              </a>
            </dd>
          </dl>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href="/" className="btn btn-primary">
              Back to the client side
            </Link>
            <Link href="/staff" className="btn btn-quiet">
              Back to the firm side
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
