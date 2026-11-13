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
    `inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${
      isActive ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:border-ink"
    }`;

  return (
    <>
      <PageHeader title="Inquiries">
        Everyone who has contacted the firm, newest first, with any new safety concern at the top. Each inquiry is scored when it arrives. Open one to run the conflict check and send the
        engagement letter.
      </PageHeader>

      <nav aria-label="Filter by stage" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href="/staff" className={tab(active === null)} aria-current={active === null ? "true" : undefined}>
          All <span className="tabular-nums opacity-70">{all.length}</span>
        </Link>
        {FILTERS.map((filter) => (
          <Link key={filter.key} href={`/staff?status=${filter.key}`} className={tab(active === filter.key)} aria-current={active === filter.key ? "true" : undefined}>
            {filter.label} <span className="tabular-nums opacity-70">{all.filter((lead) => lead.status === filter.key).length}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="panel p-6 text-muted">
          No inquiries at this stage. <Link href="/" className="font-semibold text-juniper underline">Start one from the client side</Link>.
        </p>
      ) : (
        <ul className="panel divide-y divide-line">
          {shown.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/staff/leads/${lead.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 hover:bg-paper sm:px-5 md:grid-cols-[minmax(0,1fr)_8.5rem_15rem_9.5rem]"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    {lead.name}
                    {lead.safetyConcern && <span className="rounded bg-flag px-1.5 py-0.5 text-xs font-semibold text-white">Safety concern</span>}
                  </p>
                  <p className="truncate text-[0.9375rem] text-muted">
                    {matterLabel(lead.matterType)}
                    {lead.adverseName ? `, other side ${lead.adverseName}` : ""}
                  </p>
                </div>
                <div className="justify-self-end md:justify-self-start">
                  <Score value={lead.score} tier={lead.scoreTier} />
                </div>
                <div className="min-w-0 text-[0.9375rem] text-muted">
                  <p>Arrived {timeAgo(lead.createdAt, ctx.now)}</p>
                  <p className="truncate">{lead.consultAt ? `Consultation ${formatSlot(lead.consultAt)}` : "Wants a call back"}</p>
                </div>
                <div className="justify-self-end">
                  <StatusChip status={lead.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
