import type { Metadata } from "next";
import Link from "next/link";
import { Letter } from "@/components/letter";
import { SignPanel } from "@/components/sign-panel";
import { fmtDateTime } from "@/lib/format";
import { firmOnLetter } from "@/lib/intake";
import { getCtx } from "@/server/session";
import { getSigningView, markViewed } from "@/server/workflow";

export const metadata: Metadata = { title: "Sign your engagement letter" };

export default async function SignPage({ params }: PageProps<"/sign/[token]">) {
  const { token } = await params;
  const ctx = await getCtx();
  await markViewed(ctx, token);
  const view = await getSigningView(ctx, token);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-[82rem] flex-1 px-5 py-16 sm:px-8 lg:py-24">
        <h1 className="display max-w-[20ch] text-[clamp(2.125rem,4.2vw,3.5rem)]">This signing link does not work here</h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
          Each visitor to this demo gets their own private copy of the sample data, so a signing link only opens where that copy is open. The link also
          stops working when the demo is reset.
        </p>
        <Link href="/staff" className="btn btn-primary mt-6">
          Go to the firm side
        </Link>
      </main>
    );
  }

  const { request, document, lead } = view;
  const signed = request.status === "signed";
  // The client signs the letter as it was written, so the page carries the name on the letter.
  const firm = firmOnLetter(document.fields.firmName);

  return (
    <>
      <header className="bg-gradient-to-b from-stone to-surface">
        <div className="mx-auto w-full max-w-[72rem] px-5 pb-6 pt-5 sm:px-8 lg:pb-8">
          <p className="font-serif text-[1.5625rem] font-normal leading-none tracking-[-0.01em] [overflow-wrap:anywhere]">{firm.name}</p>
          <h1 className="display mt-10 max-w-[22ch] text-[clamp(2.125rem,4.2vw,3.5rem)]">
            {signed ? (
              <>
                Thank you. <span className="accent">Your letter is signed.</span>
              </>
            ) : (
              <>
                {request.signerName}, <span className="accent">please read and sign your engagement letter.</span>
              </>
            )}
          </h1>
          <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-muted">
            {signed ? (
                `Signed ${request.signedAt ? fmtDateTime(request.signedAt) : ""}. A real installation would email you a copy and tell the firm. This demo sends nothing.`
              ) : (
                <>
                  Read the letter below. If anything is unclear, call the firm on{" "}
                  <span className="whitespace-nowrap">{firm.phone}</span> before you sign.
                </>
              )}
          </p>
          {signed && (
            <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn btn-primary mt-6">
              Open your signed copy
            </a>
          )}
        </div>
      </header>

      <main className={`mx-auto grid w-full max-w-[72rem] flex-1 items-start gap-x-10 gap-y-8 px-5 py-8 sm:px-8 lg:py-10 ${signed ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[minmax(0,1fr)_24rem]"}`}>
        {firm.name !== ctx.firm.name && (
          <p className="demo-note col-span-full max-w-[44rem] px-4 py-3 text-[0.9375rem] leading-relaxed">
            This letter was written before the firm name on the demo was changed, so it keeps the name it was written with, as a letter already sent would.
          </p>
        )}
        <Letter firm={firm} blocks={document.blocks}>
          {signed && (
            <div className="mt-8 border-t border-line pt-4">
              {request.signatureKind === "drawn" && request.signatureData ? (
                // A data URL from the visitor's own canvas, so next/image has nothing to optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={request.signatureData} alt={`Signature of ${request.signerName}`} className="h-20" />
              ) : (
                <p className="font-serif text-3xl italic text-[#1a2e66]">{request.signatureData}</p>
              )}
              <p className="mt-1 text-[0.9375rem] text-muted">
                {request.signerName}, signed electronically {request.signedAt ? fmtDateTime(request.signedAt) : ""}
              </p>
            </div>
          )}
        </Letter>

        {!signed && (
          <div className="lg:sticky lg:top-6">
            <SignPanel token={token} signerName={request.signerName} />
          </div>
        )}

        {signed && (
          <div data-story="signed" className="demo-note p-5 lg:sticky lg:top-6">
            <p className="font-semibold">What just happened on the firm side</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
              The matter was opened, the client and matter were queued for Clio, a signed copy was emailed, and the new names joined the files that every
              future conflict check searches.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/staff/leads/${lead.id}`} className="btn btn-primary">
                See it on the firm side
              </Link>
              <Link href="/about" className="btn btn-quiet">
                What you just saw
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
