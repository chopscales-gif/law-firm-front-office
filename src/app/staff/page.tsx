import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/flash";
import { PageHeader, STAGE, Score, StatusChip } from "@/components/ui";
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

  /** A stage as a tile: its colour along the top, how many inquiries are at it, and its name. */
  const tile = (isActive: boolean) =>
    `panel relative flex min-w-[8.25rem] flex-1 flex-col sm:min-w-0 overflow-hidden px-4 pb-3 pt-4 ${isActive ? "!border-petrol !bg-petrol text-white" : "hover:border-petrol"}`;
  const COLUMNS = "xl:grid-cols-[minmax(0,1.5fr)_11rem_minmax(0,1fr)_11.5rem_1.5rem]";
  const consult = (lead: (typeof all)[number]) =>
    lead.consultAt ? `Consultation ${formatSlot(lead.consultAt)}` : ["new", "cleared"].includes(lead.status) ? (lead.channel === "chat" ? "Asked for a call back" : "No consultation booked") : "";

  return (
    <>
      <PageHeader title="Inquiries">
        Everyone who has contacted the firm, newest first, with any new safety concern at the top. Each inquiry is scored when it arrives. Open one to run the conflict check and send the
        engagement letter.
      </PageHeader>

      <nav aria-label="Filter by stage" className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 xl:grid-cols-7">
        <Link href="/staff" className={tile(active === null)} aria-current={active === null ? "true" : undefined}>
          <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${active === null ? "bg-lake-pale" : "bg-petrol"}`} />
          <span className="font-serif text-[2rem] font-semibold leading-none tabular-nums">{all.length}</span>
          <span className="mt-1.5 text-[0.9375rem] font-semibold leading-tight">All inquiries</span>
        </Link>
        {FILTERS.map((filter) => (
          <Link key={filter.key} href={`/staff?status=${filter.key}`} className={tile(active === filter.key)} aria-current={active === filter.key ? "true" : undefined}>
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${STAGE[filter.key].bar}`} />
            <span className="font-serif text-[2rem] font-semibold leading-none tabular-nums">{all.filter((lead) => lead.status === filter.key).length}</span>
            <span className="mt-1.5 text-[0.9375rem] font-semibold leading-tight">{filter.label}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="panel mt-6 px-5 py-8 text-muted">
          No inquiries at this stage. <Link href="/" className="link">Start one from the client side</Link>.
        </p>
      ) : (
        <div className="panel mt-6 overflow-hidden">
          <div aria-hidden className={`eyebrow hidden gap-x-6 border-b border-[#c3ced2] bg-salt px-5 py-3 xl:grid ${COLUMNS}`}>
            <span>Who and what</span>
            <span>Intake score</span>
            <span>When</span>
            <span>Stage</span>
          </div>
          <ul>
            {shown.map((lead) => {
              const urgent = lead.safetyConcern && lead.status === "new";
              return (
                <li key={lead.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/staff/leads/${lead.id}`}
                    data-story-lead={lead.id}
                    className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-4 py-4 xl:px-5 ${COLUMNS} ${
                      urgent ? "bg-flag-tint shadow-[inset_5px_0_0_var(--color-flag)] hover:bg-[#f7dcd9]" : "hover:bg-lake-tint/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-serif text-xl font-semibold leading-snug text-petrol">
                        {lead.name}
                        {lead.safetyConcern && <span className="rounded-full bg-flag px-2.5 py-0.5 font-sans text-[0.8125rem] font-bold text-white">Safety concern</span>}
                      </p>
                      <p className="mt-0.5 truncate text-muted">
                        {matterLabel(lead.matterType)}
                        {lead.adverseName ? `, other side ${lead.adverseName}` : ""}
                      </p>
                    </div>
                    <div className="justify-self-end xl:justify-self-start">
                      <Score value={lead.score} tier={lead.scoreTier} />
                    </div>
                    <div className="min-w-0 text-[0.9375rem] leading-snug">
                      <p className="font-semibold">Arrived {timeAgo(lead.createdAt, ctx.now)}</p>
                      <p className="text-muted">{consult(lead)}</p>
                    </div>
                    <div className="justify-self-end xl:justify-self-start">
                      <Flash value={lead.status}>
                        <StatusChip status={lead.status} />
                      </Flash>
                    </div>
                    <span aria-hidden className="hidden text-xl font-semibold text-[#93a1a7] group-hover:text-petrol xl:block">
                      &rarr;
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
