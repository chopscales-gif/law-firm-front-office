import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { FIRM } from "../intake";
import type { Block } from "./templates";

export type PdfSignature = {
  signerName: string;
  kind: "typed" | "drawn";
  /** PNG data URL of the drawn signature. Only present when kind is "drawn". */
  imageDataUrl: string | null;
  signedAt: Date;
};

export type PdfAuditEvent = { at: Date; label: string };

export type LetterPdfInput = {
  blocks: Block[];
  signature: PdfSignature | null;
  audit: PdfAuditEvent[];
  /** SHA-256 of the letter text, printed on the audit page so the signed copy can be tied to what was sent. */
  documentHash: string;
};

const PAGE = { width: 612, height: 792, marginX: 72, marginTop: 72, marginBottom: 80 };
const INK = rgb(0.09, 0.13, 0.17);
const MUTED = rgb(0.4, 0.44, 0.47);
const JUNIPER = rgb(0.14, 0.29, 0.25);

/** The built-in PDF fonts only cover Windows-1252, so anything else is swapped for a close ASCII form. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x20-\x7E -ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function formatStamp(at: Date): string {
  return `${at.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Denver" })} MT`;
}

export async function buildLetterPdf(input: LetterPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Engagement letter (demonstration)");
  pdf.setAuthor(`${FIRM.name} (fictional firm, demonstration build)`);

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);

  const contentWidth = PAGE.width - PAGE.marginX * 2;
  let page!: PDFPage;
  let y = 0;

  const footer = (target: PDFPage) => {
    target.drawText("Demonstration document. Fictional firm and client. Not a legal form and not legal advice.", {
      x: PAGE.marginX,
      y: 44,
      size: 8,
      font: sans,
      color: MUTED,
    });
  };

  const newPage = (letterhead: boolean) => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    footer(page);
    y = PAGE.height - PAGE.marginTop;
    if (letterhead) {
      page.drawText(FIRM.name, { x: PAGE.marginX, y, size: 20, font: serifBold, color: JUNIPER });
      y -= 16;
      page.drawText(safe(`${FIRM.address}  |  ${FIRM.phone}  |  ${FIRM.email}`), { x: PAGE.marginX, y, size: 8.5, font: sans, color: MUTED });
      y -= 10;
      page.drawLine({ start: { x: PAGE.marginX, y }, end: { x: PAGE.width - PAGE.marginX, y }, thickness: 0.75, color: JUNIPER });
      y -= 28;
    }
  };

  const ensure = (height: number) => {
    if (y - height < PAGE.marginBottom) newPage(false);
  };

  const drawLines = (lines: string[], font: PDFFont, size: number, leading: number, indent = 0) => {
    for (const line of lines) {
      ensure(leading);
      page.drawText(line, { x: PAGE.marginX + indent, y, size, font, color: INK });
      y -= leading;
    }
  };

  newPage(true);

  for (const block of input.blocks) {
    if (block.type === "heading") {
      ensure(40);
      y -= 6;
      drawLines([safe(block.text)], serifBold, 12, 18);
    } else if (block.type === "list") {
      for (const item of block.items ?? []) {
        const lines = wrap(safe(item), serif, 11, contentWidth - 18);
        ensure(15);
        page.drawText("-", { x: PAGE.marginX + 4, y, size: 11, font: serif, color: INK });
        drawLines(lines, serif, 11, 15, 18);
        y -= 3;
      }
      y -= 7;
    } else {
      drawLines(wrap(safe(block.text), serif, 11, contentWidth), serif, 11, 15);
      y -= 10;
    }
  }

  // Signature block.
  ensure(170);
  y -= 8;
  drawLines(["Yours sincerely,", "", safe(FIRM.attorney), safe(FIRM.name)], serif, 11, 15);
  y -= 24;
  drawLines(["Agreed and accepted:"], serifBold, 11, 15);
  y -= 36;

  const lineY = y;
  if (input.signature) {
    if (input.signature.kind === "drawn" && input.signature.imageDataUrl) {
      const base64 = input.signature.imageDataUrl.split(",")[1] ?? "";
      const image = await pdf.embedPng(Buffer.from(base64, "base64"));
      const scale = Math.min(200 / image.width, 48 / image.height);
      page.drawImage(image, { x: PAGE.marginX, y: lineY + 2, width: image.width * scale, height: image.height * scale });
    } else {
      page.drawText(safe(input.signature.signerName), { x: PAGE.marginX + 4, y: lineY + 6, size: 22, font: serifItalic, color: rgb(0.1, 0.18, 0.4) });
    }
  }
  page.drawLine({ start: { x: PAGE.marginX, y: lineY }, end: { x: PAGE.marginX + 240, y: lineY }, thickness: 0.75, color: INK });
  y = lineY - 14;
  if (input.signature) {
    drawLines([safe(input.signature.signerName), `Signed electronically ${formatStamp(input.signature.signedAt)}`], sans, 9, 12);
  } else {
    drawLines(["Client signature", "Not yet signed"], sans, 9, 12);
  }

  // Audit page: only on a signed copy.
  if (input.signature) {
    newPage(false);
    drawLines(["Signature record"], serifBold, 16, 26);
    drawLines(
      wrap(
        "This page records how the document was signed. In this demonstration the signing service is a stand-in built for the demo; a production system would use a signature provider and also record the signer's IP address and device.",
        sans,
        9.5,
        contentWidth,
      ),
      sans,
      9.5,
      13,
    );
    y -= 14;
    for (const event of input.audit) {
      ensure(16);
      page.drawText(formatStamp(event.at), { x: PAGE.marginX, y, size: 9.5, font: sans, color: MUTED });
      page.drawText(safe(event.label), { x: PAGE.marginX + 170, y, size: 9.5, font: sans, color: INK });
      y -= 16;
    }
    y -= 14;
    drawLines(["Document fingerprint (SHA-256 of the letter text)"], sans, 9, 13);
    drawLines([input.documentHash], sans, 8.5, 13);
  }

  return pdf.save();
}
