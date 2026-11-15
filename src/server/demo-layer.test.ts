import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createEmbeddedDb, type Db } from "@/db/client";
import { ensureSandbox, firmNameOf, resetSandbox, sandboxStamp, setFirmName, touchSandbox } from "@/db/sandbox";
import { chatSessions, conflictChecks, documents, handoffs, leads, outboxMessages, signatureEvents } from "@/db/schema";
import { completedIntake, offerSlots, respond, startChat, type ChatState } from "@/lib/chat/engine";
import { ADVICE_QUESTIONS } from "@/lib/chat/scenarios";
import { STORY_CAST, nextStoryClient } from "@/lib/chat/story";
import { SEARCH_EXAMPLES } from "@/lib/conflicts/examples";
import { buildLetterPdf } from "@/lib/documents/pdf";
import { letterPlainText, type Block } from "@/lib/documents/templates";
import { DEMO_FIRM, FIRM, beforeStop, cleanFirmName, firmFor, firmOnLetter } from "@/lib/intake";
import { HANDOFF_LIFETIME_MS, checkForChanges, createHandoff, landingPath, redeemHandoff } from "./handoff";
import { unfinishedChat } from "./queries";
import { checkLeadForConflicts, createLead, createLetter, decide, searchConflicts, sendForSignature, sign, type Ctx } from "./workflow";

/** Tests of what the demo layer adds: the hand-off to a phone, the visitor's own firm name, the story and the examples. */

const NOW = new Date("2026-11-13T18:00:00Z");
const MINUTE = 60_000;
let db: Db;
let ctx: Ctx;

beforeAll(async () => {
  db = await createEmbeddedDb();
  await ensureSandbox(db, "laptop", NOW);
  ctx = { db, sandboxId: "laptop", now: NOW, firm: DEMO_FIRM };
}, 60_000);

describe("join links", () => {
  it("lead to the sandbox and page they were made for, without naming the sandbox", async () => {
    const handoff = await createHandoff(db, "laptop", "/staff", NOW);
    expect(handoff).not.toBeNull();
    expect(handoff!.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(handoff!.token).not.toContain("laptop");
    expect(handoff!.expiresAt.getTime()).toBe(NOW.getTime() + HANDOFF_LIFETIME_MS);
    expect(await redeemHandoff(db, handoff!.token, new Date(NOW.getTime() + MINUTE))).toEqual({ sandboxId: "laptop", path: "/staff" });
  });

  it("are different every time", async () => {
    const tokens = await Promise.all([1, 2, 3, 4].map(async () => (await createHandoff(db, "laptop", "/", NOW))!.token));
    expect(new Set(tokens).size).toBe(4);
  });

  it("can be opened twice while live, so a link preview does not use one up", async () => {
    const { token } = (await createHandoff(db, "laptop", "/", NOW))!;
    expect(await redeemHandoff(db, token, NOW)).not.toBeNull();
    expect(await redeemHandoff(db, token, NOW)).not.toBeNull();
  });

  it("stop working after fifteen minutes", async () => {
    const { token } = (await createHandoff(db, "laptop", "/", NOW))!;
    expect(await redeemHandoff(db, token, new Date(NOW.getTime() + HANDOFF_LIFETIME_MS))).not.toBeNull();
    expect(await redeemHandoff(db, token, new Date(NOW.getTime() + HANDOFF_LIFETIME_MS + 1))).toBeNull();
  });

  it("are refused when unknown, malformed or dated in the future", async () => {
    expect(await redeemHandoff(db, "x".repeat(24), NOW)).toBeNull();
    expect(await redeemHandoff(db, "laptop", NOW)).toBeNull();
    expect(await redeemHandoff(db, "", NOW)).toBeNull();
    expect(await redeemHandoff(db, "a'; drop table handoffs; --", NOW)).toBeNull();
    const { token } = (await createHandoff(db, "laptop", "/", NOW))!;
    expect(await redeemHandoff(db, token, new Date(NOW.getTime() - MINUTE))).toBeNull();
  });

  it("are never made for a sandbox that does not exist", async () => {
    expect(await createHandoff(db, "nobody", "/", NOW)).toBeNull();
    expect(await db.select().from(handoffs).where(eq(handoffs.sandboxId, "nobody"))).toHaveLength(0);
  });

  it("are capped per sandbox, and expired ones are cleared out", async () => {
    await ensureSandbox(db, "busy", NOW);
    const old = (await createHandoff(db, "busy", "/", new Date(NOW.getTime() - 2 * HANDOFF_LIFETIME_MS)))!;
    for (let i = 0; i < 20; i++) await createHandoff(db, "busy", "/", new Date(NOW.getTime() + i));
    const rows = await db.select().from(handoffs).where(eq(handoffs.sandboxId, "busy"));
    expect(rows.length).toBeLessThanOrEqual(12);
    expect(rows.map((row) => row.token)).not.toContain(old.token);
  });

  it("die with the sandbox when the demo is reset", async () => {
    await ensureSandbox(db, "resetting", NOW);
    const { token } = (await createHandoff(db, "resetting", "/", NOW))!;
    await resetSandbox(db, "resetting", new Date(NOW.getTime() + MINUTE));
    expect(await redeemHandoff(db, token, new Date(NOW.getTime() + 2 * MINUTE))).toBeNull();
  });

  it("only land on this app's own pages", () => {
    expect(landingPath("/")).toBe("/");
    expect(landingPath("/staff")).toBe("/staff");
    expect(landingPath("/staff/leads/0b0e6c1e-7d2a-4d0e-9a55-1c2f3a4b5c6d")).toBe("/staff/leads/0b0e6c1e-7d2a-4d0e-9a55-1c2f3a4b5c6d");
    expect(landingPath("/sign/AbCdEfGhIjKlMnOpQrStUv")).toBe("/sign/AbCdEfGhIjKlMnOpQrStUv");
    expect(landingPath("/staff/conflicts?name=Kate")).toBe("/staff/conflicts");
    expect(landingPath("//evil.example")).toBeNull();
    expect(landingPath("https://evil.example/")).toBeNull();
    expect(landingPath("/\\evil.example")).toBeNull();
    expect(landingPath("/api/changes")).toBeNull();
    expect(landingPath("/join/abc")).toBeNull();
    expect(landingPath("/staff/" + "a".repeat(300))).toBeNull();
  });

  it("fall back to the front page if the stored page is not one of them", async () => {
    await db.insert(handoffs).values({ token: "t".repeat(24), sandboxId: "laptop", path: "//evil.example", createdAt: NOW });
    expect(await redeemHandoff(db, "t".repeat(24), NOW)).toEqual({ sandboxId: "laptop", path: "/" });
  });
});

describe("the change check", () => {
  beforeAll(async () => {
    await ensureSandbox(db, "pair", NOW);
  });

  it("reports nothing for a sandbox that does not exist, and creates nothing", async () => {
    expect(await checkForChanges(db, "ghost", undefined, NOW)).toEqual({ stamp: null, changed: false, until: null });
    expect(await sandboxStamp(db, "ghost")).toBeNull();
  });

  it("does not ask for more checks when no join link is live", async () => {
    const check = await checkForChanges(db, "pair", undefined, NOW);
    expect(check.until).toBeNull();
    expect(check.changed).toBe(false);
  });

  it("tells a device to redraw only when the other one changed something", async () => {
    await createHandoff(db, "pair", "/staff", NOW);
    const first = await checkForChanges(db, "pair", undefined, NOW);
    expect(first.changed).toBe(false);
    expect(first.until?.getTime()).toBe(NOW.getTime() + HANDOFF_LIFETIME_MS);
    expect((await checkForChanges(db, "pair", first.stamp!, NOW)).changed).toBe(false);

    const after = await touchSandbox(db, "pair");
    const second = await checkForChanges(db, "pair", first.stamp!, NOW);
    expect(second.changed).toBe(true);
    expect(second.stamp).toBe(after);
    expect((await checkForChanges(db, "pair", second.stamp!, NOW)).changed).toBe(false);
  });

  it("stops when the join link has run out", async () => {
    const later = new Date(NOW.getTime() + HANDOFF_LIFETIME_MS + MINUTE);
    expect((await checkForChanges(db, "pair", undefined, later)).until).toBeNull();
  });

  it("sees a reset as a change, and then has no link left to keep asking for", async () => {
    await createHandoff(db, "pair", "/staff", NOW);
    const before = (await sandboxStamp(db, "pair"))!;
    await resetSandbox(db, "pair", new Date(NOW.getTime() + MINUTE));
    const check = await checkForChanges(db, "pair", before, new Date(NOW.getTime() + 2 * MINUTE));
    expect(check.changed).toBe(true);
    expect(check.until).toBeNull();
  });

  it("returns null when touching a sandbox that is gone", async () => {
    expect(await touchSandbox(db, "ghost")).toBeNull();
  });
});

describe("a visitor's own firm name", () => {
  it("is tidied to plain text", () => {
    expect(cleanFirmName("  Reyes   &  Cole,\tP.C. ")).toEqual({ ok: true, name: "Reyes & Cole, P.C." });
    expect(cleanFirmName("O’Malley Law")).toEqual({ ok: true, name: "O'Malley Law" });
    expect(cleanFirmName("Peña – Müller")).toEqual({ ok: true, name: "Peña - Müller" });
  });

  it("must be 2 to 60 characters", () => {
    expect(cleanFirmName("A").ok).toBe(false);
    expect(cleanFirmName("   ").ok).toBe(false);
    expect(cleanFirmName("AB").ok).toBe(true);
    expect(cleanFirmName("L".repeat(60)).ok).toBe(true);
    expect(cleanFirmName("L".repeat(61)).ok).toBe(false);
  });

  it("refuses markup, line breaks that survive, emoji and names with no letter in them", () => {
    for (const bad of ["<script>alert(1)</script>", "<b>Bold</b> Law", "Smith {{clientName}}", "Law \u{1F600}", "&&&", "...", "Smith; Law", 'Smith "Law"', "a=b", "李 Law", "Smith\\Law"]) {
      expect(cleanFirmName(bad).ok, bad).toBe(false);
    }
  });

  it("keeps the rest of the firm invented and swaps the fictional addresses for placeholders", () => {
    const firm = firmFor("Reyes & Cole");
    expect(firm).toMatchObject({ name: "Reyes & Cole", shortName: "Reyes & Cole", custom: true, attorney: FIRM.attorney, phone: FIRM.phone });
    expect(firm.email).toBe("intake@yourfirm.example");
    expect(firm.site).toBe("https://yourfirm.example");
    expect(firmFor(null)).toBe(DEMO_FIRM);
    expect(firmFor("")).toBe(DEMO_FIRM);
    expect(firmOnLetter(FIRM.name)).toBe(DEMO_FIRM);
    expect(firmOnLetter(undefined)).toBe(DEMO_FIRM);
    expect(firmOnLetter("Reyes & Cole").custom).toBe(true);
  });

  it("does not double a full stop at the end of a sentence", () => {
    expect(beforeStop("Reyes & Cole, P.C.")).toBe("Reyes & Cole, P.C");
    expect(beforeStop("Reyes & Cole")).toBe("Reyes & Cole");
  });

  it("is stored on the sandbox and put back by a reset", async () => {
    await ensureSandbox(db, "named", NOW);
    expect(await firmNameOf(db, "named")).toBeNull();
    await setFirmName(db, "named", "O'Malley & Reyes");
    expect(await firmNameOf(db, "named")).toBe("O'Malley & Reyes");
    expect(await ensureSandbox(db, "named", NOW)).toBe("O'Malley & Reyes");
    expect(await firmNameOf(db, "laptop")).toBeNull();
    await resetSandbox(db, "named", NOW);
    expect(await firmNameOf(db, "named")).toBeNull();
    expect(await firmNameOf(db, "ghost")).toBeNull();
  });

  describe("appears wherever the firm is named", () => {
    const NAME = "O'Malley, Reyes & Associates, P.C.";
    const firm = firmFor(NAME);
    let mine: Ctx;
    let blocks: Block[];
    let fields: Record<string, string>;
    let token: string;
    let leadId: string;

    beforeAll(async () => {
      await ensureSandbox(db, "theirs", NOW);
      await setFirmName(db, "theirs", NAME);
      mine = { db, sandboxId: "theirs", now: NOW, firm };
      const lead = await createLead(
        mine,
        {
          matterType: "trust", name: "Dana Whitlock", adverseName: null, relatedNames: ["Owen Whitlock"], state: "Utah", county: "Salt Lake",
          urgency: "planning", signals: { realEstate: true }, email: "dana.whitlock@mail.example", phone: "(801) 555-0188", source: "referral",
          consultAt: "2026-11-16T17:00:00.000Z", description: "We need a trust.", safetyConcern: false,
        },
        "chat",
      );
      leadId = lead.id;
      await checkLeadForConflicts(mine, lead.id);
      await decide(mine, lead.id, "cleared", "");
      const letter = await createLetter(mine, lead.id);
      blocks = letter.blocks;
      fields = letter.fields;
      token = (await sendForSignature(mine, lead.id)).token;
      await sign(mine, token, { kind: "typed", data: "Dana Whitlock", consent: true });
    });

    it("in the chat", () => {
      const opening = startChat(offerSlots(NOW), firm);
      expect(opening.replies.join(" ")).toContain(beforeStop(NAME));
      expect(opening.replies.join(" ")).not.toContain("Alder");
      expect(opening.replies.join(" ")).not.toContain("..");
      let state = opening.state;
      const said: string[] = [];
      for (const line of STORY_CAST[0].messages) {
        const turn = respond(state, line, undefined, firm);
        state = turn.state;
        said.push(...turn.replies);
      }
      expect(said.join(" ")).not.toContain("Alder & Finch");
    });

    it("in the engagement letter, with no placeholder left and no doubled full stop", () => {
      const text = letterPlainText(blocks);
      expect(text).toContain(NAME);
      expect(text).not.toContain("Alder & Finch");
      expect(text).not.toMatch(/\{\{|\}\}|undefined/);
      expect(text).not.toContain("P.C..");
      expect(fields.firmName).toBe(NAME);
    });

    it("in every message written for the inquiry, without the fictional firm's addresses", async () => {
      const messages = await db.select().from(outboxMessages).where(eq(outboxMessages.sandboxId, "theirs"));
      const written = messages.filter((m) => m.leadId === leadId);
      expect(written.length).toBeGreaterThanOrEqual(4);
      const all = written.map((m) => `${m.subject}\n${m.body}\n${JSON.stringify(m.payload ?? {})}`).join("\n");
      expect(all).toContain(beforeStop(NAME));
      expect(all).not.toContain("Alder & Finch");
      expect(all).not.toContain("alderfinch.example");
      expect(all).not.toContain("P.C..");
    });

    it("in the PDF, drawn as typed", async () => {
      const bytes = await buildLetterPdf({
        firm,
        blocks,
        signature: { signerName: "Dana Whitlock", kind: "typed", imageDataUrl: null, signedAt: NOW },
        audit: [{ at: NOW, label: "Signed by Dana Whitlock (typed name)" }],
        documentHash: "abc123",
      });
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
      expect(pdf.getTitle() ?? "").not.toContain("Alder");
    });

    it("but not on a letter written before the name was typed, which keeps the name it was written with", async () => {
      // Documents already created keep the name they were created with.
      const seeded = await db.select().from(documents).where(eq(documents.sandboxId, "theirs"));
      const earlier = seeded.filter((d) => d.leadId !== leadId);
      expect(earlier.length).toBeGreaterThanOrEqual(1);
      for (const document of earlier) {
        expect(document.fields.firmName).toBe(FIRM.name);
        expect(firmOnLetter(document.fields.firmName)).toBe(DEMO_FIRM);
      }
    });

    it("and never in another visitor's sandbox", async () => {
      const others = await db.select().from(outboxMessages).where(eq(outboxMessages.sandboxId, "laptop"));
      expect(others.map((m) => m.body).join("\n")).not.toContain("O'Malley, Reyes");
    });
  });
});

describe("restoring a chat after a reload", () => {
  let mine: Ctx;
  const save = async (state: ChatState, messages: { role: "assistant" | "visitor"; text: string }[], at: Date, leadId: string | null = null) => {
    const id = randomUUID();
    await db.insert(chatSessions).values({ id, sandboxId: mine.sandboxId, state, messages, suggestions: [], leadId, createdAt: at });
    return id;
  };

  beforeAll(async () => {
    await ensureSandbox(db, "chatter", NOW);
    mine = { db, sandboxId: "chatter", now: NOW, firm: DEMO_FIRM };
  });

  it("offers nothing before the visitor has said anything", async () => {
    expect(await unfinishedChat(mine)).toBeNull();
    const opening = startChat(offerSlots(NOW));
    await save(opening.state, opening.replies.map((text) => ({ role: "assistant" as const, text })), NOW);
    expect(await unfinishedChat(mine)).toBeNull();
  });

  it("brings back the most recent conversation that is still going", async () => {
    const opening = startChat(offerSlots(NOW));
    const turn = respond(opening.state, "I need a will");
    const messages = [
      ...opening.replies.map((text) => ({ role: "assistant" as const, text })),
      { role: "visitor" as const, text: "I need a will" },
      ...turn.replies.map((text) => ({ role: "assistant" as const, text })),
    ];
    const id = await save(turn.state, messages, new Date(NOW.getTime() + MINUTE));
    const restored = await unfinishedChat(mine);
    expect(restored?.id).toBe(id);
    expect(restored?.messages).toEqual(messages);
    expect(restored?.state.status).toBe("collecting");
  });

  it("starts fresh once the latest conversation has finished", async () => {
    const opening = startChat(offerSlots(NOW));
    let state = opening.state;
    for (const line of STORY_CAST[0].messages) state = respond(state, line).state;
    expect(state.status).not.toBe("collecting");
    await save(state, [{ role: "visitor", text: "done" }], new Date(NOW.getTime() + 2 * MINUTE));
    expect(await unfinishedChat(mine)).toBeNull();
  });

  it("never brings back another visitor's conversation", async () => {
    expect(await unfinishedChat(ctx)).toBeNull();
  });
});

describe("the story", () => {
  it("uses a different invented client each time, and says when it has run out", () => {
    expect(new Set(STORY_CAST.map((c) => c.name)).size).toBe(STORY_CAST.length);
    expect(nextStoryClient([])?.name).toBe(STORY_CAST[0].name);
    expect(nextStoryClient([STORY_CAST[0].name.toUpperCase()])?.name).toBe(STORY_CAST[1].name);
    expect(nextStoryClient(STORY_CAST.map((c) => c.name))).toBeNull();
    for (const client of STORY_CAST) expect(client.messages.join(" ")).toMatch(/@mail\.example or \d{3}-555-01\d\d/);
  });

  it("finishes the intake for every client without the assistant asking anything twice", () => {
    for (const client of STORY_CAST) {
      const opening = startChat(offerSlots(NOW));
      let state = opening.state;
      const asked: string[] = [...opening.replies];
      for (const line of client.messages) {
        expect(state.status, `${client.name} before "${line}"`).toBe("collecting");
        const turn = respond(state, line);
        expect(turn.guardrail).toBeNull();
        state = turn.state;
        asked.push(...turn.replies);
      }
      const questions = asked.filter((reply) => reply.includes("?"));
      expect(new Set(questions).size, client.name).toBe(questions.length);
      const intake = completedIntake(state);
      expect(intake, client.name).not.toBeNull();
      expect(intake).toMatchObject({ name: client.name, relatedNames: [client.messages[2]], adverseName: null, state: "Utah" });
      expect(intake!.consultAt).not.toBeNull();
      expect(["will", "trust"]).toContain(intake!.matterType);
    }
  });

  it("runs clear through the conflict check for every client, one after another, in one sandbox", async () => {
    await ensureSandbox(db, "story", NOW);
    const story: Ctx = { db, sandboxId: "story", now: NOW, firm: DEMO_FIRM };
    for (const client of STORY_CAST) {
      let state = startChat(offerSlots(NOW)).state;
      for (const line of client.messages) state = respond(state, line).state;
      const lead = await createLead(story, completedIntake(state)!, "chat");
      const check = await checkLeadForConflicts(story, lead.id);
      expect(check.outcome, client.name).toBe("clear");
      await decide(story, lead.id, "cleared", "");
      await createLetter(story, lead.id);
      const request = await sendForSignature(story, lead.id);
      const signed = await sign(story, request.token, { kind: "typed", data: client.name, consent: true });
      expect(signed.lead.status).toBe("signed");
    }
    const names = (await db.select({ name: leads.name }).from(leads).where(eq(leads.sandboxId, "story"))).map((l) => l.name);
    expect(nextStoryClient(names)).toBeNull();
  }, 60_000);
});

describe("try to fool it", () => {
  it("finds every example that is written differently from the name on file", async () => {
    for (const example of SEARCH_EXAMPLES.filter((e) => e.found)) {
      const result = await searchConflicts(ctx, [{ name: example.name, role: example.role }]);
      expect(result.outcome, example.name).not.toBe("clear");
      expect(result.hits[0].strength, example.name).not.toBe("weak");
      expect(result.hits[0].partyName.toLowerCase(), example.name).not.toBe(example.name.toLowerCase());
    }
  });

  it("finds nothing at all for the example that is a different person", async () => {
    const misses = SEARCH_EXAMPLES.filter((e) => !e.found);
    expect(misses.length).toBeGreaterThanOrEqual(1);
    for (const example of misses) {
      const result = await searchConflicts(ctx, [{ name: example.name, role: example.role }]);
      expect(result.outcome, example.name).toBe("clear");
      expect(result.hits, example.name).toHaveLength(0);
    }
  });

  it("declines each legal advice question offered on the chat, at the start and midway, and carries on", () => {
    for (const question of ADVICE_QUESTIONS) {
      const opening = startChat(offerSlots(NOW));
      const first = respond(opening.state, question);
      expect(first.guardrail, question).toBe("advice");
      expect(first.replies.join(" ")).toMatch(/legal advice/i);
      expect(first.state.status).toBe("collecting");

      let state = opening.state;
      for (const line of STORY_CAST[0].messages.slice(0, 3)) state = respond(state, line).state;
      const midway = respond(state, question);
      expect(midway.guardrail, question).toBe("advice");
      expect(midway.state.answered).toEqual(state.answered);
      expect(midway.replies.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("times in the sample data", () => {
  const localMinutes = (at: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23" }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)!.value;
    return { minutes: Number(get("hour")) * 60 + Number(get("minute")), weekday: get("weekday") };
  };

  // A weekday afternoon, the small hours of a Monday, a Sunday evening, and a summer morning on daylight saving time.
  const moments = ["2026-11-13T18:00:00Z", "2026-11-16T08:10:00Z", "2026-11-16T03:30:00Z", "2026-07-06T14:05:00Z", "2026-11-14T21:00:00Z"];

  it.each(moments)("are plausible for a visitor arriving at %s", async (iso) => {
    const now = new Date(iso);
    const id = `clock-${iso}`;
    await ensureSandbox(db, id, now);

    const inquiries = await db.select().from(leads).where(eq(leads.sandboxId, id));
    expect(inquiries).toHaveLength(8);
    for (const lead of inquiries) {
      expect(lead.createdAt.getTime(), lead.name).toBeLessThanOrEqual(now.getTime());
      const { minutes } = localMinutes(lead.createdAt);
      // Clients write in between 6:30 in the morning and 10:30 at night.
      expect(minutes, `${lead.name} wrote in at ${minutes} minutes past midnight`).toBeGreaterThanOrEqual(6 * 60 + 30);
      expect(minutes, lead.name).toBeLessThanOrEqual(22 * 60 + 30);
    }
    // The list keeps its order: each inquiry is newer than the one seeded before it.
    const byName = new Map(inquiries.map((l) => [l.name, l.createdAt.getTime()]));
    const order = ["Rosalind Achterberg", "Gideon Marsh", "Daniel Park", "Petra Lindholm", "Marguerite Dufresne", "Wren Castellanos", "Imani Okafor", "Hollis Brandt"];
    for (let i = 1; i < order.length; i++) expect(byName.get(order[i])!, order[i]).toBeGreaterThan(byName.get(order[i - 1])!);

    // The office works on weekdays, in office hours.
    const checks = await db.select().from(conflictChecks).where(eq(conflictChecks.sandboxId, id));
    expect(checks.length).toBeGreaterThanOrEqual(5);
    for (const check of checks) {
      const { minutes, weekday } = localMinutes(check.ranAt);
      expect(["Mon", "Tue", "Wed", "Thu", "Fri"]).toContain(weekday);
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThanOrEqual(17 * 60 + 30);
      expect(check.ranAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    const events = await db.select().from(signatureEvents).where(eq(signatureEvents.sandboxId, id));
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const event of events) {
      const { minutes } = localMinutes(event.at);
      expect(minutes, event.type).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes, event.type).toBeLessThanOrEqual(21 * 60);
      expect(event.at.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  }, 60_000);
});
