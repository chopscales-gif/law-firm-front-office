import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildLetterPdf } from "./pdf";
import { letterPlainText, merge, renderLetter, templateFor, type LetterInput } from "./templates";

const input: LetterInput = {
  name: "José Hernández",
  email: "jose@mail.example",
  phone: "(801) 555-0117",
  matterType: "divorce",
  adverseName: "Marisol Hernández",
  relatedNames: [],
  county: "Salt Lake",
  date: new Date("2026-11-13T18:00:00Z"),
};

describe("engagement letter templates", () => {
  it("picks the template by practice area", () => {
    expect(templateFor("divorce")).toBe("engagement-family");
    expect(templateFor("trust")).toBe("engagement-estate");
  });

  it("fills every field, leaving no placeholders behind", () => {
    for (const matterType of ["divorce", "custody", "will", "trust", "probate"] as const) {
      const { blocks } = renderLetter(templateFor(matterType), { ...input, matterType });
      expect(letterPlainText(blocks)).not.toMatch(/\{\{|\}\}|undefined|null/);
    }
  });

  it("names the client and the other party", () => {
    const text = letterPlainText(renderLetter("engagement-family", input).blocks);
    expect(text).toContain("José Hernández");
    expect(text).toContain("Marisol Hernández");
    expect(text).toContain("November 13, 2026");
  });

  it("words a probate letter as court work on an estate, with its own fee", () => {
    const text = letterPlainText(renderLetter("engagement-estate", { ...input, matterType: "probate", adverseName: null, relatedNames: ["Rosa Hernández"] }).blocks);
    expect(text).toContain("probate of the estate of Rosa Hernández");
    expect(text).not.toContain("We will prepare your probate");
    expect(text).toContain("$3,200");
  });

  it("does not claim that no conflict was found", () => {
    expect(letterPlainText(renderLetter("engagement-family", input).blocks)).not.toMatch(/found no conflict/);
  });

  it("leaves an unknown field visible so a broken template is obvious", () => {
    expect(merge("Dear {{clientName}}, re {{missing}}", { clientName: "Ana" })).toBe("Dear Ana, re {{missing}}");
  });
});

describe("letter PDF", () => {
  const { blocks } = renderLetter("engagement-family", input);

  it("builds an unsigned letter", async () => {
    const bytes = await buildLetterPdf({ blocks, signature: null, audit: [], documentHash: "abc123" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("adds a signature record page once signed", async () => {
    const unsigned = await PDFDocument.load(await buildLetterPdf({ blocks, signature: null, audit: [], documentHash: "abc123" }));
    const signedAt = new Date("2026-11-13T19:00:00Z");
    const signed = await PDFDocument.load(
      await buildLetterPdf({
        blocks,
        signature: { signerName: input.name, kind: "typed", imageDataUrl: null, signedAt },
        audit: [{ at: signedAt, label: "Signed by José Hernández (typed name)" }],
        documentHash: "abc123",
      }),
    );
    expect(signed.getPageCount()).toBe(unsigned.getPageCount() + 1);
  });

  it("copes with characters the built-in fonts cannot draw", async () => {
    const odd = [{ type: "paragraph" as const, text: "Zoë “quoted” — 李 ✍︎ Łukasz" }];
    await expect(buildLetterPdf({ blocks: odd, signature: null, audit: [], documentHash: "x" })).resolves.toBeInstanceOf(Uint8Array);
  });
});
