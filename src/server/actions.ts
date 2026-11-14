"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { resetSandbox } from "@/db/sandbox";
import { chatSessions, leads, type ChatMessage } from "@/db/schema";
import { completedIntake, offerSlots, respond, startChat } from "@/lib/chat/engine";
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

async function run(work: (ctx: Ctx) => Promise<unknown>): Promise<ActionResult> {
  try {
    await work(await getCtx());
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

export async function resetDemoAction(): Promise<void> {
  const sandboxId = await sandboxIdFromCookie();
  await resetSandbox(await getDb(), sandboxId);
  revalidatePath("/", "layout");
  redirect("/");
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
      const opening = startChat(offerSlots(now, await bookedConsultTimes(ctx)));
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

    const turn = respond(session.state, message);
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
    if (leadId !== session.leadId) revalidatePath("/", "layout");

    return { ok: true, view: { sessionId: session.id, added, suggestions: turn.suggestions, status: turn.state.status, leadId } };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "That message did not go through. Try sending it again." };
  }
}
