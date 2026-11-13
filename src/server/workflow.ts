import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, count, desc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  conflictChecks,
  documents,
  leads,
  matters,
  outboxMessages,
  parties,
  signatureEvents,
  signatureRequests,
  type ConflictCheck,
  type DocumentRow,
  type Lead,
  type SignatureRequest,
} from "@/db/schema";
import { runConflictCheck, type ConflictResult, type PartyRecord, type Subject } from "@/lib/conflicts/check";
import { looksLikeOrganization } from "@/lib/conflicts/normalize";
import { letterPlainText, renderLetter, templateFor } from "@/lib/documents/templates";
import {
  clioMessages,
  declineMessage,
  inquiryMessages,
  signatureRequestMessage,
  signedMessages,
  type Outgoing,
} from "@/lib/integrations/messages";
import { areaOf, matterLabel, type IntakeData } from "@/lib/intake";
import { scoreLead } from "@/lib/scoring";

/**
 * The matter-opening workflow: inquiry, conflict check, decision, engagement
 * letter, signature, matter opened. Every function takes the database and the
 * visitor's sandbox, plus the time, so the whole flow runs in tests without Next.js.
 */

export class WorkflowError extends Error {}

export type Ctx = { db: Db; sandboxId: string; now: Date };

async function queue(ctx: Ctx, leadId: string | null, messages: (Outgoing | null)[]): Promise<void> {
  const rows = messages
    .filter((m): m is Outgoing => m !== null)
    .map((m, i) => ({
      id: randomUUID(),
      sandboxId: ctx.sandboxId,
      leadId,
      channel: m.channel,
      recipient: m.recipient,
      subject: m.subject,
      body: m.body,
      payload: m.payload ?? null,
      sendAt: m.sendAt ?? ctx.now,
      // Keep messages queued together in a stable order.
      createdAt: new Date(ctx.now.getTime() + i),
    }));
  if (rows.length) await ctx.db.insert(outboxMessages).values(rows);
}

export async function getLead(ctx: Ctx, leadId: string): Promise<Lead> {
  const [lead] = await ctx.db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.sandboxId, ctx.sandboxId)));
  if (!lead) throw new WorkflowError("That inquiry no longer exists. The demo data may have been reset.");
  return lead;
}

export async function createLead(ctx: Ctx, intake: IntakeData, channel: Lead["channel"]): Promise<Lead> {
  const score = scoreLead(intake);
  const [lead] = await ctx.db
    .insert(leads)
    .values({
      id: randomUUID(),
      sandboxId: ctx.sandboxId,
      createdAt: ctx.now,
      channel,
      status: "new",
      name: intake.name,
      email: intake.email,
      phone: intake.phone,
      matterType: intake.matterType,
      description: intake.description,
      adverseName: intake.adverseName,
      relatedNames: intake.relatedNames,
      state: intake.state,
      county: intake.county,
      urgency: intake.urgency,
      signals: intake.signals,
      source: intake.source,
      consultAt: intake.consultAt ? new Date(intake.consultAt) : null,
      safetyConcern: intake.safetyConcern,
      score: score.total,
      scoreTier: score.tier,
      scoreFactors: score.factors,
    })
    .returning();
  await queue(ctx, lead.id, inquiryMessages(lead, `/staff/leads/${lead.id}`));
  return lead;
}

/** Every name on file, shaped for the matcher. */
export async function loadParties(ctx: Ctx, excludeLeadId?: string): Promise<PartyRecord[]> {
  const rows = await ctx.db
    .select({ party: parties, matter: matters })
    .from(parties)
    .innerJoin(matters, eq(parties.matterId, matters.id))
    .where(eq(parties.sandboxId, ctx.sandboxId));
  return rows
    // A lead must not conflict with the matter that was opened from it.
    .filter((r) => !excludeLeadId || r.matter.leadId !== excludeLeadId)
    .map(({ party, matter }) => ({
      id: party.id,
      name: party.name,
      aliases: party.aliases,
      kind: party.kind,
      role: party.role,
      email: party.email,
      phone: party.phone,
      matterId: matter.id,
      matterName: matter.name,
      matterStatus: matter.status,
    }));
}

export function subjectsOf(lead: Pick<Lead, "name" | "email" | "phone" | "adverseName" | "relatedNames">): Subject[] {
  const subjects: Subject[] = [{ name: lead.name, role: "prospect", email: lead.email, phone: lead.phone }];
  if (lead.adverseName) subjects.push({ name: lead.adverseName, role: "adverse" });
  for (const name of lead.relatedNames) subjects.push({ name, role: "related" });
  return subjects;
}

/** Enough re-runs for anyone exploring the demo; stops a script from filling the database. */
const MAX_CHECKS_PER_SANDBOX = 300;

export async function checkLeadForConflicts(ctx: Ctx, leadId: string): Promise<ConflictCheck> {
  const lead = await getLead(ctx, leadId);
  const [{ total }] = await ctx.db.select({ total: count() }).from(conflictChecks).where(eq(conflictChecks.sandboxId, ctx.sandboxId));
  if (total >= MAX_CHECKS_PER_SANDBOX) throw new WorkflowError("This demo sandbox is full. Use Reset demo in the bar at the top to start again.");
  const subjects = subjectsOf(lead);
  const result = runConflictCheck(subjects, await loadParties(ctx, lead.id));
  const [check] = await ctx.db
    .insert(conflictChecks)
    .values({
      id: randomUUID(),
      sandboxId: ctx.sandboxId,
      leadId: lead.id,
      ranAt: ctx.now,
      outcome: result.outcome,
      summary: result.summary,
      subjects,
      hits: result.hits,
      partiesSearched: result.partiesSearched,
    })
    .returning();
  return check;
}

/** A one-off search from the conflict search screen. Nothing is stored. */
export async function searchConflicts(ctx: Ctx, subjects: Subject[]): Promise<ConflictResult> {
  return runConflictCheck(subjects, await loadParties(ctx));
}

export async function latestCheck(ctx: Ctx, leadId: string): Promise<ConflictCheck | null> {
  const [check] = await ctx.db
    .select()
    .from(conflictChecks)
    .where(and(eq(conflictChecks.leadId, leadId), eq(conflictChecks.sandboxId, ctx.sandboxId)))
    .orderBy(desc(conflictChecks.ranAt))
    .limit(1);
  return check ?? null;
}

export type Decision = "cleared" | "flagged" | "declined";

export async function decide(ctx: Ctx, leadId: string, decision: Decision, note: string): Promise<Lead> {
  const lead = await getLead(ctx, leadId);
  if (lead.status === "letter_sent" || lead.status === "signed") {
    throw new WorkflowError("The engagement letter has already gone out, so the decision can't be changed here.");
  }
  const check = await latestCheck(ctx, leadId);
  if (decision === "cleared") {
    if (!check) throw new WorkflowError("Run the conflict check before clearing this inquiry.");
    if (check.outcome !== "clear" && !note.trim()) {
      throw new WorkflowError("The check found something. Add a note saying why it is safe to proceed.");
    }
  }
  if (decision !== "cleared" && !note.trim()) {
    throw new WorkflowError("Add a short note explaining the decision.");
  }
  const [updated] = await ctx.db
    .update(leads)
    .set({ status: decision, decisionNote: note.trim() || null, decidedAt: ctx.now })
    .where(and(eq(leads.id, leadId), eq(leads.sandboxId, ctx.sandboxId)))
    .returning();
  if (decision !== "cleared") {
    // A letter drafted while the inquiry was cleared must not survive a change of mind.
    await ctx.db
      .delete(documents)
      .where(and(eq(documents.leadId, leadId), eq(documents.sandboxId, ctx.sandboxId), eq(documents.status, "draft")));
  }
  if (decision === "declined" && lead.status !== "declined") await queue(ctx, leadId, [declineMessage(lead)]);
  return updated;
}

export async function getDocument(ctx: Ctx, leadId: string): Promise<DocumentRow | null> {
  const [doc] = await ctx.db
    .select()
    .from(documents)
    .where(and(eq(documents.leadId, leadId), eq(documents.sandboxId, ctx.sandboxId)))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  return doc ?? null;
}

export async function createLetter(ctx: Ctx, leadId: string): Promise<DocumentRow> {
  const lead = await getLead(ctx, leadId);
  if (lead.status !== "cleared") {
    throw new WorkflowError("An engagement letter can only be prepared after the inquiry is cleared for conflicts.");
  }
  // Re-generating replaces an unsent draft.
  await ctx.db
    .delete(documents)
    .where(and(eq(documents.leadId, leadId), eq(documents.sandboxId, ctx.sandboxId), eq(documents.status, "draft")));
  const letter = renderLetter(templateFor(lead.matterType), {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    matterType: lead.matterType,
    adverseName: lead.adverseName,
    relatedNames: lead.relatedNames,
    county: lead.county,
    date: ctx.now,
  });
  const [doc] = await ctx.db
    .insert(documents)
    .values({
      id: randomUUID(),
      sandboxId: ctx.sandboxId,
      leadId,
      templateKey: templateFor(lead.matterType),
      title: letter.title,
      blocks: letter.blocks,
      fields: letter.fields,
      sha256: createHash("sha256").update(letterPlainText(letter.blocks)).digest("hex"),
      status: "draft",
      createdAt: ctx.now,
    })
    .returning();
  return doc;
}

async function logEvent(ctx: Ctx, requestId: string, type: "sent" | "viewed" | "consented" | "signed", label: string, offsetMs = 0) {
  await ctx.db.insert(signatureEvents).values({
    id: randomUUID(),
    sandboxId: ctx.sandboxId,
    requestId,
    type,
    label,
    at: new Date(ctx.now.getTime() + offsetMs),
  });
}

export async function sendForSignature(ctx: Ctx, leadId: string): Promise<SignatureRequest> {
  const lead = await getLead(ctx, leadId);
  if (lead.status !== "cleared") {
    throw new WorkflowError("An engagement letter can only be sent after the inquiry is cleared for conflicts.");
  }
  const doc = await getDocument(ctx, leadId);
  if (!doc || doc.status !== "draft") throw new WorkflowError("Prepare the engagement letter first.");
  return ctx.db.transaction(async (tx) => {
    const inTx = { ...ctx, db: tx as unknown as Db };
    // Claiming the draft first means two clicks cannot send the same letter twice.
    const claimed = await tx
      .update(documents)
      .set({ status: "sent" })
      .where(and(eq(documents.id, doc.id), eq(documents.sandboxId, ctx.sandboxId), eq(documents.status, "draft")))
      .returning({ id: documents.id });
    if (!claimed.length) throw new WorkflowError("This letter has already been sent.");
    return sendClaimed(inTx, lead, doc);
  });
}

async function sendClaimed(ctx: Ctx, lead: Lead, doc: DocumentRow): Promise<SignatureRequest> {
  const leadId = lead.id;
  const [request] = await ctx.db
    .insert(signatureRequests)
    .values({
      id: randomUUID(),
      sandboxId: ctx.sandboxId,
      documentId: doc.id,
      token: randomBytes(18).toString("base64url"),
      signerName: lead.name,
      signerEmail: lead.email,
      status: "pending",
      createdAt: ctx.now,
    })
    .returning();
  await ctx.db.update(leads).set({ status: "letter_sent" }).where(and(eq(leads.id, leadId), eq(leads.sandboxId, ctx.sandboxId)));
  await logEvent(ctx, request.id, "sent", `Sent to ${lead.email ?? lead.name} for signature`);
  await queue(ctx, leadId, [signatureRequestMessage(lead, `/sign/${request.token}`)]);
  return request;
}

export type SigningView = { request: SignatureRequest; document: DocumentRow; lead: Lead };

export async function getSigningView(ctx: Ctx, token: string): Promise<SigningView | null> {
  const [row] = await ctx.db
    .select({ request: signatureRequests, document: documents, lead: leads })
    .from(signatureRequests)
    .innerJoin(documents, eq(signatureRequests.documentId, documents.id))
    .innerJoin(leads, eq(documents.leadId, leads.id))
    .where(and(eq(signatureRequests.token, token), eq(signatureRequests.sandboxId, ctx.sandboxId)));
  return row ?? null;
}

export async function markViewed(ctx: Ctx, token: string): Promise<void> {
  const view = await getSigningView(ctx, token);
  if (!view || view.request.status !== "pending") return;
  const opened = await ctx.db
    .update(signatureRequests)
    .set({ status: "viewed" })
    .where(and(eq(signatureRequests.id, view.request.id), eq(signatureRequests.sandboxId, ctx.sandboxId), eq(signatureRequests.status, "pending")))
    .returning({ id: signatureRequests.id });
  if (opened.length) await logEvent(ctx, view.request.id, "viewed", `Opened by ${view.request.signerName}`);
}

export type SignatureInput = { kind: "typed" | "drawn"; data: string; consent: boolean };

/** Records the signature, then opens the matter and queues everything that follows from it. */
export async function sign(ctx: Ctx, token: string, input: SignatureInput): Promise<{ lead: Lead; matterId: string }> {
  const view = await getSigningView(ctx, token);
  if (!view) throw new WorkflowError("This signing link is not valid. The demo data may have been reset.");
  if (view.request.status === "signed") throw new WorkflowError("This letter has already been signed.");
  if (!input.consent) throw new WorkflowError("Please tick the box to agree to sign electronically.");
  const data = input.data.trim();
  if (input.kind === "typed" && data.length < 2) throw new WorkflowError("Type your full name to sign.");
  if (input.kind === "drawn" && !isPngDataUrl(data)) throw new WorkflowError("Draw your signature in the box to sign.");
  if (data.length > 400_000) throw new WorkflowError("That signature is too large. Clear it and try again.");

  const { request, document, lead } = view;
  return ctx.db.transaction((tx) => recordSignature({ ...ctx, db: tx as unknown as Db }, { request, document, lead }, input.kind, data));
}

const PNG_SIGNATURE = "iVBORw0KGgo";

/** A base64 PNG data URL, checked by its header so a malformed one never reaches the PDF builder. */
function isPngDataUrl(data: string): boolean {
  const prefix = "data:image/png;base64,";
  return data.startsWith(prefix) && data.slice(prefix.length).startsWith(PNG_SIGNATURE) && /^[A-Za-z0-9+/]+=*$/.test(data.slice(prefix.length));
}

async function recordSignature(ctx: Ctx, view: SigningView, kind: SignatureInput["kind"], data: string): Promise<{ lead: Lead; matterId: string }> {
  const { request, document, lead } = view;
  // The conditional update is the lock: of two submissions, only one finds the request unsigned.
  const claimed = await ctx.db
    .update(signatureRequests)
    .set({ status: "signed", signatureKind: kind, signatureData: data, signedAt: ctx.now })
    .where(and(eq(signatureRequests.id, request.id), eq(signatureRequests.sandboxId, ctx.sandboxId), ne(signatureRequests.status, "signed")))
    .returning({ id: signatureRequests.id });
  if (!claimed.length) throw new WorkflowError("This letter has already been signed.");
  const input = { kind };
  await logEvent(ctx, request.id, "consented", "Agreed to sign electronically");
  await logEvent(ctx, request.id, "signed", `Signed by ${request.signerName} (${input.kind === "typed" ? "typed name" : "drawn signature"})`, 1);
  await ctx.db.update(documents).set({ status: "signed" }).where(and(eq(documents.id, document.id), eq(documents.sandboxId, ctx.sandboxId)));
  const [signedLead] = await ctx.db
    .update(leads)
    .set({ status: "signed" })
    .where(and(eq(leads.id, lead.id), eq(leads.sandboxId, ctx.sandboxId)))
    .returning();

  // Open the matter. Its parties join the files that future conflict checks search.
  const surname = lead.name.trim().split(/\s+/).at(-1) ?? lead.name;
  const matterName = `${surname}: ${matterLabel(lead.matterType).toLowerCase()}`;
  const matterId = randomUUID();
  await ctx.db.insert(matters).values({
    id: matterId,
    sandboxId: ctx.sandboxId,
    name: matterName,
    practiceArea: areaOf(lead.matterType) === "estate" ? "estate" : "family",
    status: "open",
    openedOn: ctx.now,
    leadId: lead.id,
  });
  const partyRows = [
    { name: lead.name, role: "client" as const, email: lead.email, phone: lead.phone },
    ...(lead.adverseName ? [{ name: lead.adverseName, role: "opposing" as const, email: null, phone: null }] : []),
    ...lead.relatedNames.map((name) => ({ name, role: "related" as const, email: null, phone: null })),
  ].map((p) => ({
    id: randomUUID(),
    sandboxId: ctx.sandboxId,
    matterId,
    aliases: [],
    kind: looksLikeOrganization(p.name) ? ("organization" as const) : ("person" as const),
    ...p,
  }));
  await ctx.db.insert(parties).values(partyRows);

  await queue(ctx, lead.id, [
    ...signedMessages(lead, matterName, `/api/documents/${document.id}/pdf`),
    ...clioMessages(lead, matterName, ctx.now),
  ]);
  return { lead: signedLead, matterId };
}
