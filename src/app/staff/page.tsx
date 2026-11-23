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

  const COLUMNS = "xl:grid-cols-[minmax(0,1.3fr)_11rem_minmax(0,1.3fr)_10rem_1.25rem]";
  const consult = (lead: (typeof all)[number]) =>
    lead.consultAt ? `Consultation ${formatSlot(lead.consultAt)}` : ["new", "cleared"].includes(lead.status) ? (lead.channel === "chat" ? "Asked for a call back" : "No consultation booked") : "";
  const urgentCount = all.filter((lead) => lead.safetyConcern && lead.status === "new").length;
  const waiting = all.filter((lead) => lead.status === "new" || lead.status === "flagged").length;
  const cell = (isActive: boolean) => `grid min-w-[8.5rem] flex-1 content-between gap-4 px-4 pb-4 pt-[1.125rem] xl:px-[1.125rem] sm:min-w-0 ${isActive ? "bg-lime-tint" : "bg-surface hover:bg-stone"}`;

  return (
    <>
      <PageHeader
        label="Inquiries"
        title={all.length === 1 ? "One person has asked for help." : `${count(all.length)} people have asked for help.`}
        accent={urgentCount ? (urgentCount === 1 ? "One needs you now." : `${count(urgentCount)} need you now.`) : waiting ? (waiting === 1 ? "One is waiting on you." : `${count(waiting)} are waiting on you.`) : "None is waiting on you."}
      >
        Everyone who has contacted the firm, newest first, with any new safety concern at the top. Each inquiry is scored when it arrives. Open one to run the conflict check and send the
        engagement letter.
      </PageHeader>

      <nav aria-label="Filter by stage" className="-mx-5 px-5 pb-6 pt-1 max-sm:overflow-x-auto sm:mx-0 sm:px-0">
        <div className="flex w-max min-w-full gap-px overflow-hidden rounded-[1.125rem] border border-line bg-line shadow-lift sm:grid sm:w-auto sm:grid-cols-4 xl:grid-cols-7">
          <Link href="/staff" className={cell(active === null)} aria-current={active === null ? "true" : undefined}>
            <span className="text-[0.9375rem] font-medium text-muted">All inquiries</span>
            <span className="figure text-[2.5rem]">{all.length}</span>
          </Link>
          {FILTERS.map((filter) => (
            <Link key={filter.key} href={`/staff?status=${filter.key}`} className={cell(active === filter.key)} aria-current={active === filter.key ? "true" : undefined}>
              <span className="flex items-center gap-2 whitespace-nowrap text-[0.9375rem] font-medium text-muted">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${STAGE[filter.key].dot}`} />
                {filter.label}
              </span>
              <span className="figure text-[2.5rem]">{all.filter((lead) => lead.status === filter.key).length}</span>
            </Link>
          ))}
        </div>
      </nav>

      {shown.length === 0 ? (
        <p className="panel px-5 py-8 text-muted">
          No inquiries at this stage. <Link href="/" className="link">Start one from the client side</Link>.
        </p>
      ) : (
        <>
          <div aria-hidden className={`eyebrow hidden gap-x-6 px-[1.375rem] pb-2.5 xl:grid ${COLUMNS}`}>
            <span>Who and what</span>
            <span>Intake score</span>
            <span>When</span>
            <span>Stage</span>
          </div>
          <ul className="grid gap-2.5">
            {shown.map((lead) => {
              const urgent = lead.safetyConcern && lead.status === "new";
              return (
                <li key={lead.id}>
                  <Link
                    href={`/staff/leads/${lead.id}`}
                    data-story-lead={lead.id}
                    className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 rounded-2xl border px-5 py-4 shadow-rest transition-shadow hover:shadow-lift xl:px-[1.375rem] ${COLUMNS} ${
                      urgent ? "border-[#f3cfc9] bg-gradient-to-r from-flag-tint to-[#fff5f0] to-70%" : "border-line bg-surface"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-medium leading-snug tracking-[-0.01em]">
                        {lead.name}
                        {lead.safetyConcern && <span className="tag bg-flag text-white">Safety concern</span>}
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
                    <span aria-hidden className="hidden text-xl text-[#b3b8b3] group-hover:text-forest xl:block">
                      &rarr;
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
/** A small count written as a word, the way a person would say it. */
const count = (n: number) => WORDS[n] ?? String(n);
