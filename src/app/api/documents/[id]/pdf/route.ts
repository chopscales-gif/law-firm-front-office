import { buildLetterPdf } from "@/lib/documents/pdf";
import { findDocument, signatureFor } from "@/server/queries";
import { getCtx } from "@/server/session";

/** The engagement letter as a PDF. Once signed, it carries the signature and an audit page. */
export async function GET(_request: Request, { params }: RouteContext<"/api/documents/[id]/pdf">) {
  const { id } = await params;
  const ctx = await getCtx();
  const document = await findDocument(ctx, id);
  if (!document) return new Response("Document not found. The demo data may have been reset.", { status: 404 });

  const state = await signatureFor(ctx, document.id);
  const request = state?.request;
  const signature =
    request?.status === "signed" && request.signatureKind && request.signedAt
      ? {
          signerName: request.signerName,
          kind: request.signatureKind,
          imageDataUrl: request.signatureKind === "drawn" ? request.signatureData : null,
          signedAt: request.signedAt,
        }
      : null;

  const pdf = await buildLetterPdf({
    blocks: document.blocks,
    signature,
    audit: state?.events.map((event) => ({ at: event.at, label: event.label })) ?? [],
    documentHash: document.sha256,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="engagement-letter${signature ? "-signed" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
