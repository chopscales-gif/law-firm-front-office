import { index, uniqueIndex, integer, jsonb, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import type { ChatState } from "@/lib/chat/engine";
import type { ConflictHit, ConflictOutcome, Subject } from "@/lib/conflicts/check";
import type { Block, TemplateKey } from "@/lib/documents/templates";
import type { IntakeSignals, LeadSource, MatterType, Urgency } from "@/lib/intake";
import type { ScoreFactor } from "@/lib/scoring";

/**
 * Every row belongs to a sandbox: one visitor's private copy of the demo data.
 * Deleting the sandbox row removes everything that visitor created.
 */
export const sandboxes = pgTable("sandboxes", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const sandboxId = () =>
  text("sandbox_id")
    .notNull()
    .references(() => sandboxes.id, { onDelete: "cascade" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export type LeadStatus = "new" | "cleared" | "flagged" | "declined" | "letter_sent" | "signed";

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    createdAt: createdAt(),
    channel: text("channel").$type<"chat" | "form" | "phone">().notNull(),
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    matterType: text("matter_type").$type<MatterType>().notNull(),
    description: text("description").notNull().default(""),
    adverseName: text("adverse_name"),
    relatedNames: jsonb("related_names").$type<string[]>().notNull().default([]),
    state: text("state").notNull(),
    county: text("county"),
    urgency: text("urgency").$type<Urgency>().notNull(),
    signals: jsonb("signals").$type<IntakeSignals>().notNull().default({}),
    source: text("source").$type<LeadSource>().notNull(),
    consultAt: timestamp("consult_at", { withTimezone: true }),
    safetyConcern: boolean("safety_concern").notNull().default(false),
    score: integer("score").notNull(),
    scoreTier: text("score_tier").$type<"hot" | "warm" | "cool">().notNull(),
    scoreFactors: jsonb("score_factors").$type<ScoreFactor[]>().notNull(),
    /** Who decided to clear, flag or decline, and why. */
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("leads_sandbox_idx").on(t.sandboxId)],
);

export const matters = pgTable(
  "matters",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    name: text("name").notNull(),
    practiceArea: text("practice_area").$type<"family" | "estate">().notNull(),
    status: text("status").$type<"open" | "closed">().notNull(),
    openedOn: timestamp("opened_on", { withTimezone: true }).notNull(),
    /** Set when the matter was opened from a lead in this app. */
    leadId: text("lead_id"),
  },
  (t) => [
    index("matters_sandbox_idx").on(t.sandboxId),
    // One matter per signed lead, whatever the application code does.
    uniqueIndex("matters_lead_unique").on(t.sandboxId, t.leadId),
  ],
);

export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    matterId: text("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    kind: text("kind").$type<"person" | "organization">().notNull(),
    role: text("role").$type<"client" | "opposing" | "related">().notNull(),
    email: text("email"),
    phone: text("phone"),
  },
  (t) => [index("parties_sandbox_idx").on(t.sandboxId)],
);

export const conflictChecks = pgTable(
  "conflict_checks",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    /** Null for a search run from the conflict search screen. */
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: text("outcome").$type<ConflictOutcome>().notNull(),
    summary: text("summary").notNull(),
    subjects: jsonb("subjects").$type<Subject[]>().notNull(),
    /** Snapshot of what was found at the time, so the record does not change when the files do. */
    hits: jsonb("hits").$type<ConflictHit[]>().notNull(),
    partiesSearched: integer("parties_searched").notNull(),
  },
  (t) => [index("conflict_checks_sandbox_idx").on(t.sandboxId)],
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    templateKey: text("template_key").$type<TemplateKey>().notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    fields: jsonb("fields").$type<Record<string, string>>().notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").$type<"draft" | "sent" | "signed">().notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [index("documents_sandbox_idx").on(t.sandboxId)],
);

export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Unguessable value in the signing link. */
    token: text("token").notNull().unique(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    status: text("status").$type<"pending" | "viewed" | "signed">().notNull().default("pending"),
    signatureKind: text("signature_kind").$type<"typed" | "drawn">(),
    /** The typed name, or a PNG data URL of the drawn signature. */
    signatureData: text("signature_data"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("signature_requests_sandbox_idx").on(t.sandboxId)],
);

export const signatureEvents = pgTable("signature_events", {
  id: text("id").primaryKey(),
  sandboxId: sandboxId(),
  requestId: text("request_id")
    .notNull()
    .references(() => signatureRequests.id, { onDelete: "cascade" }),
  type: text("type").$type<"sent" | "viewed" | "consented" | "signed">().notNull(),
  label: text("label").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type OutboxChannel = "email" | "sms" | "clio";

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: text("id").primaryKey(),
    sandboxId: sandboxId(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    channel: text("channel").$type<OutboxChannel>().notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** The request a real integration would have sent, for the technical reader. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** When a real system would deliver it. Later than createdAt for scheduled reminders. */
    sendAt: timestamp("send_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("outbox_sandbox_idx").on(t.sandboxId)],
);

export type ChatMessage = { role: "assistant" | "visitor"; text: string; guardrail?: "advice" | "safety" };

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  sandboxId: sandboxId(),
  state: jsonb("state").$type<ChatState>().notNull(),
  messages: jsonb("messages").$type<ChatMessage[]>().notNull(),
  suggestions: jsonb("suggestions").$type<string[]>().notNull().default([]),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export type Lead = typeof leads.$inferSelect;
export type Matter = typeof matters.$inferSelect;
export type Party = typeof parties.$inferSelect;
export type ConflictCheck = typeof conflictChecks.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type SignatureEvent = typeof signatureEvents.$inferSelect;
export type OutboxMessage = typeof outboxMessages.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
