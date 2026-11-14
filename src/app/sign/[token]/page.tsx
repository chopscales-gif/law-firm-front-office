import type { Metadata } from "next";
import Link from "next/link";
import { Letter } from "@/components/letter";
import { SignPanel } from "@/components/sign-panel";
import { fmtDateTime } from "@/lib/format";
import { FIRM } from "@/lib/intake";
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
      <main className="w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
        <h1 className="font-serif text-4xl font-medium leading-tight">This signing link does not work here</h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
          Each visitor to this demo gets their own private copy of the sample data, so a signing link only opens in the browser that created it. The link
          also stops working when the demo is reset.
        </p>
        <Link href="/staff" className="btn btn-primary mt-6">
          Go to the firm side
        </Link>
      </main>
    );
  }

  const { request, document, lead } = view;
  const signed = request.status === "signed";

  return (
    <>
      <header className="on-dark bg-petrol text-white">
        <div className="mx-auto w-full max-w-[72rem] px-4 pb-8 pt-5 sm:px-6 lg:px-10 lg:pb-10 lg:pt-8">
          <p className="font-serif text-[1.375rem] font-semibold leading-none">{FIRM.name}</p>
          <h1 className="mt-7 max-w-[24ch] font-serif text-[2rem] font-medium leading-[1.1] tracking-[-0.015em] sm:text-5xl">
            {signed ? "Thank you. Your letter is signed." : `${request.signerName}, please read and sign your engagement letter.`}
          </h1>
          <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-white/85">
            {signed ? (
                `Signed ${request.signedAt ? fmtDateTime(request.signedAt) : ""}. A real installation would email you a copy and tell the firm. This demo sends nothing.`
              ) : (
                <>
                  Read the letter below. If anything is unclear, call the firm on{" "}
                  <span className="whitespace-nowrap">{FIRM.phone}</span> before you sign.
                </>
              )}
          </p>
          {signed && (
            <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn mt-6 bg-white text-petrol hover:bg-lake-tint">
              Open your signed copy
            </a>
          )}
        </div>
      </header>

      <main className={`mx-auto grid w-full max-w-[72rem] flex-1 items-start gap-x-10 gap-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10 ${signed ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-[minmax(0,1fr)_24rem]"}`}>
        <Letter blocks={document.blocks}>
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
          <div className="demo-note p-5 lg:sticky lg:top-6">
            <p className="font-semibold">What just happened on the firm side</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
              The matter was opened, the client and matter were queued for Clio, a signed copy was emailed, and the new names joined the files that every
              future conflict check searches.
            </p>
            <Link href={`/staff/leads/${lead.id}`} className="btn btn-primary mt-4">
              See it on the firm side
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
