import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Score, StatusChip } from "@/components/ui";
import type { LeadStatus } from "@/db/schema";
import { formatSlot } from "@/lib/chat/engine";
import { timeAgo } from "@/lib/format";
import { matterLabel } from "@/lib/intake";
import { listLeads } from "@/server/queries";
import { getCtx } from "@/server/session";

export const metadata: Metadata = { title: "Inquiries" };

const FILTERS: { key: LeadStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "flagged", label: "Held for review" },
  { key: "cleared", label: "Cleared" },
  { key: "letter_sent", label: "Awaiting signature" },
  { key: "signed", label: "Signed" },
  { key: "declined", label: "Declined" },
];

export default async function InquiriesPage({ searchParams }: PageProps<"/staff">) {
  const ctx = await getCtx();
  const all = await listLeads(ctx);
  const { status } = await searchParams;
  const active = FILTERS.find((f) => f.key === status)?.key ?? null;
  const shown = active ? all.filter((lead) => lead.status === active) : all;

  const tab = (isActive: boolean) =>
    `inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-[3px] px-1 font-semibold ${
      isActive ? "border-petrol text-petrol" : "border-transparent text-muted hover:border-line hover:text-ink"
    }`;
  const COLUMNS = "md:grid-cols-[minmax(0,1.5fr)_9.5rem_minmax(0,1fr)_11.5rem]";
  const consult = (lead: (typeof all)[number]) =>
    lead.consultAt ? `Consultation ${formatSlot(lead.consultAt)}` : ["new", "cleared"].includes(lead.status) ? (lead.channel === "chat" ? "Asked for a call back" : "No consultation booked") : "";

  return (
    <>
      <PageHeader title="Inquiries">
        Everyone who has contacted the firm, newest first, with any new safety concern at the top. Each inquiry is scored when it arrives. Open one to run the conflict check and send the
        engagement letter.
      </PageHeader>

      <nav aria-label="Filter by stage" className="-mx-4 flex gap-x-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href="/staff" className={tab(active === null)} aria-current={active === null ? "true" : undefined}>
          All <span className="font-normal tabular-nums">{all.length}</span>
        </Link>
        {FILTERS.map((filter) => (
          <Link key={filter.key} href={`/staff?status=${filter.key}`} className={tab(active === filter.key)} aria-current={active === filter.key ? "true" : undefined}>
            {filter.label} <span className="font-normal tabular-nums">{all.filter((lead) => lead.status === filter.key).length}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="py-8 text-muted">
          No inquiries at this stage. <Link href="/" className="link">Start one from the client side</Link>.
        </p>
      ) : (
        <>
          <div aria-hidden className={`hidden gap-x-6 border-b border-line px-3 pb-2 pt-5 text-[0.9375rem] text-muted md:grid ${COLUMNS}`}>
            <span>Who and what</span>
            <span>Intake score</span>
            <span>When</span>
            <span>Stage</span>
          </div>
          <ul className="mt-3 md:mt-0">
            {shown.map((lead) => (
              <li key={lead.id} className="border-b border-line">
                <Link
                  href={`/staff/leads/${lead.id}`}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-1 py-4 hover:bg-surface md:px-3 md:py-3.5 ${COLUMNS} ${
                    lead.safetyConcern && lead.status === "new" ? "shadow-[inset_4px_0_0_var(--color-flag)]" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-serif text-[1.1875rem] font-semibold leading-snug">
                      {lead.name}
                      {lead.safetyConcern && <span className="rounded-sm bg-flag px-1.5 py-0.5 font-sans text-[0.8125rem] font-semibold text-white">Safety concern</span>}
                    </p>
                    <p className="truncate text-muted">
                      {matterLabel(lead.matterType)}
                      {lead.adverseName ? `, other side ${lead.adverseName}` : ""}
                    </p>
                  </div>
                  <div className="justify-self-end md:justify-self-start">
                    <Score value={lead.score} tier={lead.scoreTier} />
                  </div>
                  <div className="min-w-0 text-[0.9375rem] leading-snug">
                    <p>Arrived {timeAgo(lead.createdAt, ctx.now)}</p>
                    <p className="text-muted">{consult(lead)}</p>
                  </div>
                  <div className="justify-self-end md:justify-self-start">
                    <StatusChip status={lead.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
