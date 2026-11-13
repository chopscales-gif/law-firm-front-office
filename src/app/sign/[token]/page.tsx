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
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <h1 className="font-serif text-3xl">This signing link does not work here</h1>
        <p className="mt-3 leading-relaxed text-muted">
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
    <main className="mx-auto w-full max-w-[44rem] flex-1 px-4 py-8 sm:py-12">
      <p className="font-serif text-2xl text-juniper-deep">{FIRM.name}</p>
      <h1 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{signed ? "Thank you. Your letter is signed." : `${request.signerName}, please read and sign your engagement letter.`}</h1>
      <p className="mt-3 max-w-[62ch] leading-relaxed text-muted">
        {signed
          ? `Signed ${request.signedAt ? fmtDateTime(request.signedAt) : ""}. A real installation would email you a copy and tell the firm. This demo sends nothing.`
          : "Read the letter below. If anything is unclear, call the firm before you sign."}
      </p>

      {signed && (
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/api/documents/${document.id}/pdf`} target="_blank" className="btn btn-primary">
            Open your signed copy
          </a>
        </div>
      )}

      <div className="mt-8">
        <Letter blocks={document.blocks}>
          {signed && (
            <div className="mt-8 border-t border-line pt-4">
              {request.signatureKind === "drawn" && request.signatureData ? (
                // A data URL from the visitor's own canvas, so next/image has nothing to optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={request.signatureData} alt={`Signature of ${request.signerName}`} className="h-20" />
              ) : (
                <p className="text-3xl italic text-[#1a2e66]">{request.signatureData}</p>
              )}
              <p className="mt-1 font-sans text-[0.8125rem] text-muted">
                {request.signerName}, signed electronically {request.signedAt ? fmtDateTime(request.signedAt) : ""}
              </p>
            </div>
          )}
        </Letter>
      </div>

      {!signed && (
        <div className="mt-8">
          <SignPanel token={token} signerName={request.signerName} />
        </div>
      )}

      {signed && (
        <div className="demo-chrome mt-8 rounded-lg bg-ink p-5 text-white">
          <p className="font-semibold">What just happened on the firm side</p>
          <p className="mt-1 max-w-[62ch] text-[0.9375rem] leading-relaxed text-white/75">
            The matter was opened, the client and matter were queued for Clio, a signed copy was emailed, and the new names joined the files that every
            future conflict check searches.
          </p>
          <Link href={`/staff/leads/${lead.id}`} className="btn mt-4 bg-white text-ink hover:bg-white/90">
            See it on the firm side
          </Link>
        </div>
      )}
    </main>
  );
}
