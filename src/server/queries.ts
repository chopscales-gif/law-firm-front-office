import { and, asc, desc, eq } from "drizzle-orm";
import {
  chatSessions,
  documents,
  leads,
  matters,
  outboxMessages,
  parties,
  signatureEvents,
  signatureRequests,
  type DocumentRow,
  type Lead,
  type Matter,
  type OutboxMessage,
  type ChatSession,
  type Party,
  type SignatureEvent,
  type SignatureRequest,
} from "@/db/schema";
import type { Ctx } from "./workflow";

/** Read-only queries for the screens. Every one is scoped to the visitor's sandbox. */

export async function listLeads(ctx: Ctx): Promise<Lead[]> {
  const rows = await ctx.db.select().from(leads).where(eq(leads.sandboxId, ctx.sandboxId)).orderBy(desc(leads.createdAt));
  // The assistant tells a visitor who mentions danger that the firm will see them first, so they are.
  const urgent = (lead: Lead) => lead.safetyConcern && lead.status === "new";
  return [...rows.filter(urgent), ...rows.filter((lead) => !urgent(lead))];
}

/** Consultation times already given out, so the assistant does not offer them to someone else. */
export async function bookedConsultTimes(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db.select({ consultAt: leads.consultAt }).from(leads).where(eq(leads.sandboxId, ctx.sandboxId));
  return rows.flatMap((row) => (row.consultAt ? [row.consultAt.toISOString()] : []));
}

export async function findLead(ctx: Ctx, leadId: string): Promise<Lead | null> {
  const [lead] = await ctx.db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.sandboxId, ctx.sandboxId)));
  return lead ?? null;
}

export type SignatureState = { request: SignatureRequest; events: SignatureEvent[] };

export async function signatureFor(ctx: Ctx, documentId: string): Promise<SignatureState | null> {
  const [request] = await ctx.db
    .select()
    .from(signatureRequests)
    .where(and(eq(signatureRequests.documentId, documentId), eq(signatureRequests.sandboxId, ctx.sandboxId)))
    .orderBy(desc(signatureRequests.createdAt))
    .limit(1);
  if (!request) return null;
  const events = await ctx.db
    .select()
    .from(signatureEvents)
    .where(eq(signatureEvents.requestId, request.id))
    .orderBy(asc(signatureEvents.at));
  return { request, events };
}

export async function findDocument(ctx: Ctx, documentId: string): Promise<DocumentRow | null> {
  const [doc] = await ctx.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.sandboxId, ctx.sandboxId)));
  return doc ?? null;
}

export async function matterForLead(ctx: Ctx, leadId: string): Promise<Matter | null> {
  const [matter] = await ctx.db
    .select()
    .from(matters)
    .where(and(eq(matters.leadId, leadId), eq(matters.sandboxId, ctx.sandboxId)));
  return matter ?? null;
}

export async function outboxFor(ctx: Ctx, leadId?: string): Promise<OutboxMessage[]> {
  return ctx.db
    .select()
    .from(outboxMessages)
    .where(and(eq(outboxMessages.sandboxId, ctx.sandboxId), leadId ? eq(outboxMessages.leadId, leadId) : undefined))
    .orderBy(desc(outboxMessages.createdAt));
}

export type MatterWithParties = Matter & { parties: Party[] };

export async function listMatters(ctx: Ctx): Promise<MatterWithParties[]> {
  const [matterRows, partyRows] = await Promise.all([
    ctx.db.select().from(matters).where(eq(matters.sandboxId, ctx.sandboxId)).orderBy(desc(matters.openedOn)),
    ctx.db.select().from(parties).where(eq(parties.sandboxId, ctx.sandboxId)),
  ]);
  const order = { client: 0, opposing: 1, related: 2 };
  return matterRows.map((matter) => ({
    ...matter,
    parties: partyRows.filter((p) => p.matterId === matter.id).sort((a, b) => order[a.role] - order[b.role]),
  }));
}

/**
 * The conversation to put back on the client side after a reload, or when the
 * visitor carries on from a second device: the sandbox's most recent one, if
 * it is still unfinished. A finished conversation starts a fresh chat.
 */
export async function unfinishedChat(ctx: Ctx): Promise<ChatSession | null> {
  const [latest] = await ctx.db.select().from(chatSessions).where(eq(chatSessions.sandboxId, ctx.sandboxId)).orderBy(desc(chatSessions.createdAt)).limit(1);
  return latest && latest.state.status === "collecting" && latest.messages.some((m) => m.role === "visitor") ? latest : null;
}
