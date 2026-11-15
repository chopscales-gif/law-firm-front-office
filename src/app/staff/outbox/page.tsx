import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { outboxFor } from "@/server/queries";
import { getCtx } from "@/server/session";

export const metadata: Metadata = { title: "Outbox" };

const CHANNEL = { email: "Email", sms: "Text message", clio: "Clio request" };
const TAG = { email: "bg-lake-tint text-petrol", sms: "bg-plum-tint text-plum", clio: "bg-amber-tint text-amber" };
const EDGE = { email: "!border-l-lake", sms: "!border-l-plum", clio: "!border-l-amber" };

export default async function OutboxPage() {
  const ctx = await getCtx();
  const messages = await outboxFor(ctx);

  return (
    <>
      <PageHeader title="Outbox">
        Every email, text message and Clio request the system would have sent, newest first. Nothing leaves this demo. In a real installation these go
        out through the firm&apos;s email provider, a text messaging service and the Clio API.
      </PageHeader>

      {ctx.firm.custom && (
        <p className="demo-note mb-6 max-w-[60rem] px-4 py-3 text-[0.9375rem] leading-relaxed">
          Messages written from now on carry {ctx.firm.name}. Anything written earlier keeps the name it was written with, as a sent message would. The email
          addresses and the people stay invented.
        </p>
      )}

      {messages.length === 0 ? (
        <p className="panel max-w-[60rem] px-5 py-8 text-muted">Nothing has been sent yet.</p>
      ) : (
        <ul className="max-w-[60rem] space-y-3">
          {messages.map((message) => (
            <li key={message.id} id={message.id} className={`panel scroll-mt-6 border-l-[6px] px-5 py-5 target:outline target:outline-[3px] target:outline-offset-2 target:outline-petrol ${EDGE[message.channel]}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.9375rem] text-muted">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-[0.8125rem] font-bold ${TAG[message.channel]}`}>{CHANNEL[message.channel]}</span>
                  <span>
                    to <span className="font-semibold text-ink">{message.recipient}</span>
                  </span>
                </span>
                <span>{message.sendAt > ctx.now ? `Scheduled for ${fmtDateTime(message.sendAt)}` : fmtDateTime(message.createdAt)}</span>
              </div>
              <h2 className="mt-2.5 font-serif text-xl font-semibold leading-snug text-petrol [overflow-wrap:anywhere]">{message.subject}</h2>
              <p className="mt-2 max-w-[72ch] whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{message.body}</p>
              <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
                {message.leadId && (
                  <Link href={`/staff/leads/${message.leadId}`} className="link inline-flex min-h-11 items-center lg:min-h-0">
                    Open the inquiry
                  </Link>
                )}
                {message.payload && (
                  <details className="min-w-0 flex-1 basis-full">
                    <summary className="link inline-flex min-h-11 cursor-pointer items-center lg:min-h-0">Show the request</summary>
                    <pre className="mt-2 overflow-x-auto rounded border border-line bg-salt p-3 text-sm leading-relaxed">{JSON.stringify(message.payload, null, 2)}</pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
