"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import qrcode from "qrcode-generator";
import { z } from "zod";
import { getDb } from "@/db/client";
import { resetSandbox, sandboxStamp, setFirmName, touchSandbox, type SandboxStamp } from "@/db/sandbox";
import { chatSessions, leads, type ChatMessage } from "@/db/schema";
import { completedIntake, offerSlots, respond, startChat } from "@/lib/chat/engine";
import { nextStoryClient } from "@/lib/chat/story";
import { cleanFirmName } from "@/lib/intake";
import { SANDBOX_COOKIE_OPTIONS, SEEN_COOKIE } from "./cookie";
import { createHandoff, landingPath } from "./handoff";
import { bookedConsultTimes } from "./queries";
import { getCtx, sandboxIdFromCookie } from "./session";
import {
  WorkflowError,
  checkLeadForConflicts,
  createLead,
  createLetter,
  decide,
  sendForSignature,
  sign,
  type Ctx,
  type Decision,
} from "./workflow";

/**
 * Server actions: the thin layer between the screens and the workflow. Each one
 * validates its input, runs a workflow function in the visitor's sandbox, and
 * returns a plain result the screen can show.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Enough for anyone exploring the demo; stops a script from filling the database. */
const MAX_LEADS_PER_SANDBOX = 60;
const MAX_CHAT_MESSAGES = 80;

/**
 * Counts the change, so a second device in the same sandbox knows to redraw,
 * and notes that this device has already seen it, so it is not told to.
 */
async function recordChange(ctx: Pick<Ctx, "db" | "sandboxId">): Promise<void> {
  await markSeen(await touchSandbox(ctx.db, ctx.sandboxId));
}

async function markSeen(stamp: SandboxStamp | null): Promise<void> {
  if (stamp) (await cookies()).set(SEEN_COOKIE, stamp, SANDBOX_COOKIE_OPTIONS);
}

async function run(work: (ctx: Ctx) => Promise<unknown>): Promise<ActionResult> {
  try {
    const ctx = await getCtx();
    await work(ctx);
    await recordChange(ctx);
  } catch (error) {
    if (error instanceof WorkflowError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong on our side. Try again, or reset the demo from the bar at the top." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

const id = z.uuid();

export async function runCheckAction(leadId: string): Promise<ActionResult> {
  if (!id.safeParse(leadId).success) return { ok: false, error: "That inquiry could not be found." };
  return run((ctx) => checkLeadForConflicts(ctx, leadId));
}

export async function decideAction(leadId: string, decision: Decision, note: string): Promise<ActionResult> {
  const parsed = z
    .object({ leadId: id, decision: z.enum(["cleared", "flagged", "declined"]), note: z.string().max(1000) })
    .safeParse({ leadId, decision, note });
  if (!parsed.success) return { ok: false, error: "Keep the note under 1,000 characters." };
  return run((ctx) => decide(ctx, parsed.data.leadId, parsed.data.decision, parsed.data.note));
}

export async function createLetterAction(leadId: string): Promise<ActionResult> {
  if (!id.safeParse(leadId).success) return { ok: false, error: "That inquiry could not be found." };
  return run((ctx) => createLetter(ctx, leadId));
}

export async function sendForSignatureAction(leadId: string): Promise<ActionResult> {
  if (!id.safeParse(leadId).success) return { ok: false, error: "That inquiry could not be found." };
  return run((ctx) => sendForSignature(ctx, leadId));
}

export async function signAction(token: string, kind: "typed" | "drawn", data: string, consent: boolean): Promise<ActionResult> {
  const parsed = z
    .object({ token: z.string().min(10).max(64), kind: z.enum(["typed", "drawn"]), data: z.string().max(400_000), consent: z.boolean() })
    .safeParse({ token, kind, data, consent });
  if (!parsed.success) return { ok: false, error: "That signature could not be read. Clear it and try again." };
  return run((ctx) => sign(ctx, parsed.data.token, parsed.data));
}

/** Puts the sample data back as it was, which also puts the fictional firm's name back. */
export async function resetDemoAction(): Promise<void> {
  const sandboxId = await sandboxIdFromCookie();
  const db = await getDb();
  await resetSandbox(db, sandboxId);
  await markSeen(await sandboxStamp(db, sandboxId));
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Shows the visitor's own firm name in place of the fictional one, or puts the
 * fictional one back when given null. Only the name changes: the people, the
 * address and the sample data stay invented.
 */
export async function setFirmNameAction(raw: string | null): Promise<ActionResult> {
  if (raw !== null && typeof raw !== "string") return { ok: false, error: "That name could not be read." };
  const cleaned = raw === null ? null : cleanFirmName(raw.slice(0, 200));
  if (cleaned && !cleaned.ok) return { ok: false, error: cleaned.error };
  return run((ctx) => setFirmName(ctx.db, ctx.sandboxId, cleaned ? cleaned.name : null));
}

export type HandoffView = {
  /** The join link, on the address this visitor is using. */
  url: string;
  /** The link as a QR code, one string of 1s and 0s per row. Null where a phone could not reach the address. */
  qr: string[] | null;
  /** Milliseconds since 1970 at which the link stops working. */
  expiresAt: number;
};

export type HandoffResult = { ok: true; view: HandoffView } | { ok: false; error: string };

const LOCAL_HOST = /^(localhost|127(\.\d+){3}|\[::1\])(:\d+)?$/i;

/** Makes a short-lived link that opens this visitor's sandbox, on the given page, on another device. */
export async function createHandoffAction(path: string): Promise<HandoffResult> {
  const landing = typeof path === "string" ? landingPath(path) : null;
  if (!landing) return { ok: false, error: "This page cannot be opened on a phone." };
  try {
    const ctx = await getCtx();
    const handoff = await createHandoff(ctx.db, ctx.sandboxId, landing, ctx.now);
    if (!handoff) return { ok: false, error: "The demo data was reset. Reload the page and try again." };

    // The link is built from the address the visitor's own browser used, so it works wherever the demo is hosted.
    const incoming = await headers();
    const host = (incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "").split(",")[0].trim();
    if (!/^[A-Za-z0-9.-]+(:\d+)?$|^\[[0-9a-f:]+\](:\d+)?$/i.test(host)) return { ok: false, error: "A link could not be made for this address." };
    const local = LOCAL_HOST.test(host);
    const forwarded = incoming.get("x-forwarded-proto")?.split(",")[0].trim();
    const protocol = forwarded === "http" || forwarded === "https" ? forwarded : local || process.env.NODE_ENV !== "production" ? "http" : "https";
    const url = `${protocol}://${host}/join/${handoff.token}`;

    let qr: string[] | null = null;
    // A phone cannot open an address on the visitor's own computer, so no code is drawn for one.
    if (!local) {
      const code = qrcode(0, "M");
      code.addData(url);
      code.make();
      const size = code.getModuleCount();
      qr = Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => (code.isDark(row, column) ? "1" : "0")).join(""));
    }
    return { ok: true, view: { url, qr, expiresAt: handoff.expiresAt.getTime() } };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "The link could not be made. Try again." };
  }
}

export type StoryStart = { ok: true; name: string; messages: string[] } | { ok: false; error: string };

/** Picks the client for "Play the story": the next of the cast who has not already written in. */
export async function startStoryAction(): Promise<StoryStart> {
  try {
    const ctx = await getCtx();
    const rows = await ctx.db.select({ name: leads.name }).from(leads).where(eq(leads.sandboxId, ctx.sandboxId));
    if (rows.length >= MAX_LEADS_PER_SANDBOX) return { ok: false, error: "This demo sandbox is full. Reset the demo to play the story." };
    const client = nextStoryClient(rows.map((row) => row.name));
    if (!client) return { ok: false, error: "Every client in the story has already written in. Reset the demo to play it again." };
    return { ok: true, name: client.name, messages: client.messages };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "The story could not start. Try again." };
  }
}

export type ChatView = {
  sessionId: string;
  /** Only the messages added by this turn. */
  added: ChatMessage[];
  suggestions: string[];
  status: "collecting" | "complete" | "outside";
  /** Set once the conversation has produced an inquiry in the firm's pipeline. */
  leadId: string | null;
};

export type ChatResult = { ok: true; view: ChatView } | { ok: false; error: string };

/**
 * One visitor message in, the assistant's replies out. The conversation state
 * lives in the database, never in the browser, so the client cannot skip steps.
 */
export async function sendChatAction(sessionId: string | null, text: string): Promise<ChatResult> {
  const parsed = z.object({ sessionId: id.nullable(), text: z.string().trim().min(1).max(500) }).safeParse({ sessionId, text });
  if (!parsed.success) return { ok: false, error: "Messages can be up to 500 characters." };
  const message = parsed.data.text;

  try {
    const ctx = await getCtx();
    const { db, sandboxId, now } = ctx;

    let session = parsed.data.sessionId
      ? (await db.select().from(chatSessions).where(and(eq(chatSessions.id, parsed.data.sessionId), eq(chatSessions.sandboxId, sandboxId))))[0]
      : undefined;
    if (!session) {
      const opening = startChat(offerSlots(now, await bookedConsultTimes(ctx)), ctx.firm);
      [session] = await db
        .insert(chatSessions)
        .values({
          id: randomUUID(),
          sandboxId,
          state: opening.state,
          messages: opening.replies.map((reply) => ({ role: "assistant" as const, text: reply })),
          suggestions: opening.suggestions,
          createdAt: now,
        })
        .returning();
    }
    if (session.messages.length >= MAX_CHAT_MESSAGES) {
      return { ok: false, error: "This conversation has reached the demo's length limit. Start a new one to carry on." };
    }

    const turn = respond(session.state, message, undefined, ctx.firm);
    const added: ChatMessage[] = [
      { role: "visitor", text: message },
      ...turn.replies.map((reply, i) => ({
        role: "assistant" as const,
        text: reply,
        // The guardrail reply always comes first in a turn.
        ...(turn.guardrail && i === 0 && { guardrail: turn.guardrail }),
      })),
    ];

    let leadId = session.leadId;
    const intake = completedIntake(turn.state);
    if (intake && !leadId) {
      const [{ total }] = await db.select({ total: count() }).from(leads).where(eq(leads.sandboxId, sandboxId));
      if (total >= MAX_LEADS_PER_SANDBOX) {
        return { ok: false, error: "This demo sandbox is full. Use Reset demo in the bar at the top to start again." };
      }
      leadId = (await createLead(ctx, intake, "chat")).id;
    }

    await db
      .update(chatSessions)
      .set({ state: turn.state, messages: [...session.messages, ...added], suggestions: turn.suggestions, leadId })
      .where(eq(chatSessions.id, session.id));
    // Every message counts as a change, so a second device showing this conversation keeps up with it.
    await recordChange(ctx);
    // A new inquiry is something the firm side shows too.
    if (leadId !== session.leadId) revalidatePath("/", "layout");

    return { ok: true, view: { sessionId: session.id, added, suggestions: turn.suggestions, status: turn.state.status, leadId } };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "That message did not go through. Try sending it again." };
  }
}

/**
 * Forgets an unfinished conversation when the visitor starts over, so that a
 * reload does not bring back the one they abandoned.
 */
export async function endChatAction(sessionId: string): Promise<void> {
  if (!id.safeParse(sessionId).success) return;
  try {
    const { db, sandboxId } = await getCtx();
    // A conversation that became an inquiry is part of the record and is kept.
    await db.delete(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.sandboxId, sandboxId), isNull(chatSessions.leadId)));
    await recordChange({ db, sandboxId });
  } catch (error) {
    console.error(error);
  }
}
