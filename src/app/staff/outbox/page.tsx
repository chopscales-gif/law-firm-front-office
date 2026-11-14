import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { outboxFor } from "@/server/queries";
import { getCtx } from "@/server/session";

export const metadata: Metadata = { title: "Outbox" };

const CHANNEL = { email: "Email", sms: "Text message", clio: "Clio request" };

export default async function OutboxPage() {
  const ctx = await getCtx();
  const messages = await outboxFor(ctx);

  return (
    <>
      <PageHeader title="Outbox">
        Every email, text message and Clio request the system would have sent, newest first. Nothing leaves this demo. In a real installation these go
        out through the firm&apos;s email provider, a text messaging service and the Clio API.
      </PageHeader>

      {messages.length === 0 ? (
        <p className="py-8 text-muted">Nothing has been sent yet.</p>
      ) : (
        <ul className="max-w-[60rem] border-t-2 border-petrol">
          {messages.map((message) => (
            <li key={message.id} id={message.id} className="scroll-mt-6 border-b border-line py-5 target:bg-surface target:px-4 target:shadow-[inset_4px_0_0_var(--color-lake)]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.9375rem] text-muted">
                <span>
                  <span className="font-semibold text-ink">{CHANNEL[message.channel]}</span> to {message.recipient}
                </span>
                <span>{message.sendAt > ctx.now ? `Scheduled for ${fmtDateTime(message.sendAt)}` : fmtDateTime(message.createdAt)}</span>
              </div>
              <h2 className="mt-1 font-serif text-xl font-semibold leading-snug">{message.subject}</h2>
              <p className="mt-2 max-w-[72ch] whitespace-pre-line leading-relaxed">{message.body}</p>
              <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
                {message.leadId && (
                  <Link href={`/staff/leads/${message.leadId}`} className="link inline-flex min-h-11 items-center lg:min-h-0">
                    Open the inquiry
                  </Link>
                )}
                {message.payload && (
                  <details className="min-w-0 flex-1 basis-full">
                    <summary className="link inline-flex min-h-11 cursor-pointer items-center lg:min-h-0">Show the request</summary>
                    <pre className="mt-2 overflow-x-auto rounded border border-line bg-surface p-3 text-sm leading-relaxed">{JSON.stringify(message.payload, null, 2)}</pre>
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
