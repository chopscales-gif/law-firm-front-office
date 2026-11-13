import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createEmbeddedDb, type Db } from "@/db/client";
import { ensureSandbox, resetSandbox } from "@/db/sandbox";
import { leads, matters, outboxMessages, parties, signatureEvents } from "@/db/schema";
import type { IntakeData } from "@/lib/intake";
import {
  WorkflowError,
  checkLeadForConflicts,
  createLead,
  createLetter,
  decide,
  getDocument,
  searchConflicts,
  sendForSignature,
  sign,
  type Ctx,
} from "./workflow";

/** End-to-end tests of the matter-opening workflow against a real (in-memory) Postgres. */

const NOW = new Date("2026-11-13T18:00:00Z");
let db: Db;
let ctx: Ctx;

const intake = (over: Partial<IntakeData>): IntakeData => ({
  matterType: "will",
  name: "Dana Whitlock",
  adverseName: null,
  relatedNames: ["Owen Whitlock"],
  state: "Utah",
  county: "Salt Lake",
  urgency: "planning",
  signals: { realEstate: true },
  email: "dana.whitlock@mail.example",
  phone: "(801) 555-0188",
  source: "referral",
  consultAt: "2026-11-16T17:00:00.000Z",
  description: "We need wills.",
  safetyConcern: false,
  ...over,
});

beforeAll(async () => {
  db = await createEmbeddedDb();
  await ensureSandbox(db, "visitor-a", NOW);
  ctx = { db, sandboxId: "visitor-a", now: NOW };
}, 60_000);

describe("sandbox", () => {
  it("seeds leads at every stage of the pipeline", async () => {
    const rows = await db.select().from(leads).where(eq(leads.sandboxId, "visitor-a"));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(new Set(rows.map((l) => l.status))).toEqual(new Set(["new", "cleared", "flagged", "declined", "letter_sent", "signed"]));
  });

  it("is idempotent", async () => {
    const before = await db.select().from(leads).where(eq(leads.sandboxId, "visitor-a"));
    await ensureSandbox(db, "visitor-a", NOW);
    const after = await db.select().from(leads).where(eq(leads.sandboxId, "visitor-a"));
    expect(after).toHaveLength(before.length);
  });

  it("keeps visitors apart and resets cleanly", async () => {
    await ensureSandbox(db, "visitor-b", NOW);
    const b: Ctx = { db, sandboxId: "visitor-b", now: NOW };
    const created = await createLead(b, intake({ name: "Only In B" }), "form");
    const inA = await db.select().from(leads).where(and(eq(leads.sandboxId, "visitor-a"), eq(leads.name, "Only In B")));
    expect(inA).toHaveLength(0);

    await resetSandbox(db, "visitor-b", NOW);
    const afterReset = await db.select().from(leads).where(eq(leads.id, created.id));
    expect(afterReset).toHaveLength(0);
    const seeded = await db.select().from(matters).where(eq(matters.sandboxId, "visitor-b"));
    expect(seeded.length).toBeGreaterThan(0);
  });

  it("removes sandboxes older than two days when a new visitor arrives", async () => {
    await ensureSandbox(db, "visitor-old", new Date(NOW.getTime() - 3 * 24 * 3600_000));
    await ensureSandbox(db, "visitor-new", NOW);
    const old = await db.select().from(leads).where(eq(leads.sandboxId, "visitor-old"));
    expect(old).toHaveLength(0);
  });
});

describe("seeded scenarios the demo relies on", () => {
  const findLead = async (name: string) => {
    const [lead] = await db.select().from(leads).where(and(eq(leads.sandboxId, "visitor-a"), eq(leads.name, name)));
    return lead;
  };

  it("Imani Okafor: the other side is someone the firm is already acting against, which is not a conflict", async () => {
    const check = await checkLeadForConflicts(ctx, (await findLead("Imani Okafor")).id);
    expect(check.outcome).toBe("clear");
    expect(check.hits.find((h) => h.partyName === "William J. Thornton")?.level).toBe("info");
  });

  it("Wren Castellanos: a differently spelled former client needs review", async () => {
    const check = await checkLeadForConflicts(ctx, (await findLead("Wren Castellanos")).id);
    expect(check.outcome).toBe("review");
    expect(check.hits[0].partyName).toBe("Stephen MacAllister");
  });

  it("Daniel Park: both the prospect and the other side are in an open matter", async () => {
    const lead = await findLead("Daniel Park");
    expect(lead.status).toBe("flagged");
    const check = await checkLeadForConflicts(ctx, lead.id);
    expect(check.outcome).toBe("conflict");
    expect(check.hits.filter((h) => h.level === "conflict").map((h) => h.partyName).sort()).toEqual(["Daniel Park", "Elizabeth Park"]);
  });

  it("Hollis Brandt: nothing on file", async () => {
    const check = await checkLeadForConflicts(ctx, (await findLead("Hollis Brandt")).id);
    expect(check.outcome).toBe("clear");
  });

  it("the chat demo scenario: Marcus Bell against Kate Reyes hits a current client", async () => {
    const result = await searchConflicts(ctx, [
      { name: "Marcus Bell", role: "prospect" },
      { name: "Kate Reyes", role: "adverse" },
    ]);
    expect(result.outcome).toBe("conflict");
    expect(result.hits[0].partyName).toBe("Katherine O'Malley-Reyes");
  });
});

describe("matter-opening workflow", () => {
  it("enforces the order: check, clear, letter, signature", async () => {
    const lead = await createLead(ctx, intake({}), "chat");
    expect(lead.score).toBeGreaterThan(50);

    await expect(decide(ctx, lead.id, "cleared", "")).rejects.toThrow(WorkflowError);
    await expect(createLetter(ctx, lead.id)).rejects.toThrow(/cleared/);

    const check = await checkLeadForConflicts(ctx, lead.id);
    expect(check.outcome).toBe("clear");
    await decide(ctx, lead.id, "cleared", "");

    await expect(sendForSignature(ctx, lead.id)).rejects.toThrow(/Prepare/);
    const letter = await createLetter(ctx, lead.id);
    expect(JSON.stringify(letter.blocks)).not.toContain("{{");
    expect(JSON.stringify(letter.blocks)).toContain("Dana Whitlock");

    const request = await sendForSignature(ctx, lead.id);
    await expect(sign(ctx, request.token, { kind: "typed", data: "Dana Whitlock", consent: false })).rejects.toThrow(/tick the box/);
    await expect(sign(ctx, "wrong-token", { kind: "typed", data: "Dana Whitlock", consent: true })).rejects.toThrow(/not valid/);

    const { matterId } = await sign(ctx, request.token, { kind: "typed", data: "Dana Whitlock", consent: true });
    await expect(sign(ctx, request.token, { kind: "typed", data: "Dana Whitlock", consent: true })).rejects.toThrow(/already been signed/);

    const [matter] = await db.select().from(matters).where(eq(matters.id, matterId));
    expect(matter.name).toBe("Whitlock: will");
    const opened = await db.select().from(parties).where(eq(parties.matterId, matterId));
    expect(opened.map((p) => `${p.role}:${p.name}`).sort()).toEqual(["client:Dana Whitlock", "related:Owen Whitlock"]);

    expect((await getDocument(ctx, lead.id))?.status).toBe("signed");
    const events = await db.select().from(signatureEvents).where(eq(signatureEvents.requestId, request.id));
    expect(events.map((e) => e.type).sort()).toEqual(["consented", "sent", "signed"]);

    const sent = await db.select().from(outboxMessages).where(eq(outboxMessages.leadId, lead.id));
    expect(sent.filter((m) => m.channel === "clio")).toHaveLength(2);
    expect(sent.filter((m) => m.channel === "sms")).toHaveLength(1);
    expect(sent.some((m) => m.subject.includes("Please sign"))).toBe(true);
  });

  it("makes a newly opened matter part of future conflict checks, but not of its own", async () => {
    const result = await searchConflicts(ctx, [{ name: "Owen Whitlock", role: "adverse" }]);
    expect(result.hits.some((h) => h.matterName === "Whitlock: will")).toBe(true);

    const [lead] = await db.select().from(leads).where(and(eq(leads.sandboxId, "visitor-a"), eq(leads.name, "Dana Whitlock")));
    const recheck = await checkLeadForConflicts(ctx, lead.id);
    expect(recheck.hits.some((h) => h.matterName === "Whitlock: will")).toBe(false);
  });

  it("will not clear a flagged check without a written reason", async () => {
    const lead = await createLead(ctx, intake({ name: "Marcus Bell", matterType: "divorce", adverseName: "Kate Reyes", relatedNames: [] }), "chat");
    const check = await checkLeadForConflicts(ctx, lead.id);
    expect(check.outcome).toBe("conflict");
    await expect(decide(ctx, lead.id, "cleared", " ")).rejects.toThrow(/why it is safe/);
    await expect(decide(ctx, lead.id, "flagged", "")).rejects.toThrow(/note/);
    const flagged = await decide(ctx, lead.id, "flagged", "Other side is a current client.");
    expect(flagged.status).toBe("flagged");
  });

  it("will not send a letter once the inquiry is declined or held, and withdraws the draft", async () => {
    for (const change of ["declined", "flagged"] as const) {
      const lead = await createLead(ctx, intake({ name: `Ines Calder ${change}`, relatedNames: [] }), "form");
      await checkLeadForConflicts(ctx, lead.id);
      await decide(ctx, lead.id, "cleared", "");
      await createLetter(ctx, lead.id);
      await decide(ctx, lead.id, change, "Changed our mind.");
      expect(await getDocument(ctx, lead.id)).toBeNull();
      await expect(sendForSignature(ctx, lead.id)).rejects.toThrow(/cleared/);
    }
  });

  it("sends one declination email however many times decline is pressed", async () => {
    const lead = await createLead(ctx, intake({ name: "Otis Farrow", relatedNames: [] }), "form");
    await decide(ctx, lead.id, "declined", "No capacity.");
    await decide(ctx, lead.id, "declined", "No capacity.");
    const sent = await db.select().from(outboxMessages).where(eq(outboxMessages.leadId, lead.id));
    expect(sent.filter((m) => m.body.includes("not able to represent you"))).toHaveLength(1);
  });

  it("opens one matter when the same letter is signed twice at once", async () => {
    const lead = await createLead(ctx, intake({ name: "Petra Lindqvist", relatedNames: [] }), "form");
    await checkLeadForConflicts(ctx, lead.id);
    await decide(ctx, lead.id, "cleared", "");
    await createLetter(ctx, lead.id);
    const request = await sendForSignature(ctx, lead.id);
    await expect(sendForSignature(ctx, lead.id)).rejects.toThrow(WorkflowError);
    const input = { kind: "typed" as const, data: "Petra Lindqvist", consent: true };
    const results = await Promise.allSettled([sign(ctx, request.token, input), sign(ctx, request.token, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(matters).where(eq(matters.leadId, lead.id))).toHaveLength(1);
    const events = await db.select().from(signatureEvents).where(eq(signatureEvents.requestId, request.id));
    expect(events.filter((e) => e.type === "signed")).toHaveLength(1);
  });

  it("rejects a drawn signature that is not a PNG", async () => {
    const lead = await createLead(ctx, intake({ name: "Quentin Abara", relatedNames: [] }), "form");
    await checkLeadForConflicts(ctx, lead.id);
    await decide(ctx, lead.id, "cleared", "");
    await createLetter(ctx, lead.id);
    const request = await sendForSignature(ctx, lead.id);
    await expect(sign(ctx, request.token, { kind: "drawn", data: "data:image/png;base64,not-a-png", consent: true })).rejects.toThrow(/Draw your signature/);
  });

  it("queues a declination email when an inquiry is declined", async () => {
    const lead = await createLead(ctx, intake({ name: "Nora Vale", state: "Idaho", county: null }), "form");
    await decide(ctx, lead.id, "declined", "Out of state.");
    const sent = await db.select().from(outboxMessages).where(eq(outboxMessages.leadId, lead.id));
    expect(sent.some((m) => m.body.includes("not able to represent you"))).toBe(true);
  });
});
