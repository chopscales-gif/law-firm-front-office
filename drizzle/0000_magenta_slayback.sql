CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"messages" jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lead_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"lead_id" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL,
	"summary" text NOT NULL,
	"subjects" jsonb NOT NULL,
	"hits" jsonb NOT NULL,
	"parties_searched" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"template_key" text NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"matter_type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"adverse_name" text,
	"related_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text NOT NULL,
	"county" text,
	"urgency" text NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"consult_at" timestamp with time zone,
	"safety_concern" boolean DEFAULT false NOT NULL,
	"score" integer NOT NULL,
	"score_tier" text NOT NULL,
	"score_factors" jsonb NOT NULL,
	"decision_note" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"name" text NOT NULL,
	"practice_area" text NOT NULL,
	"status" text NOT NULL,
	"opened_on" timestamp with time zone NOT NULL,
	"lead_id" text
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"lead_id" text,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"matter_id" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"email" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "sandboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"request_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sandbox_id" text NOT NULL,
	"document_id" text NOT NULL,
	"token" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"signature_kind" text,
	"signature_data" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signature_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_checks" ADD CONSTRAINT "conflict_checks_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_checks" ADD CONSTRAINT "conflict_checks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_request_id_signature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_sandbox_id_sandboxes_id_fk" FOREIGN KEY ("sandbox_id") REFERENCES "public"."sandboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conflict_checks_sandbox_idx" ON "conflict_checks" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "documents_sandbox_idx" ON "documents" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "leads_sandbox_idx" ON "leads" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "matters_sandbox_idx" ON "matters" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "outbox_sandbox_idx" ON "outbox_messages" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "parties_sandbox_idx" ON "parties" USING btree ("sandbox_id");--> statement-breakpoint
CREATE INDEX "signature_requests_sandbox_idx" ON "signature_requests" USING btree ("sandbox_id");