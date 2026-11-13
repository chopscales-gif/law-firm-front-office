import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { listMatters } from "@/server/queries";
import { getCtx } from "@/server/session";

export const metadata: Metadata = { title: "Matters on file" };

const ROLE = { client: "Client", opposing: "Opposing party", related: "Related" };

export default async function MattersPage() {
  const ctx = await getCtx();
  const matters = await listMatters(ctx);
  const names = matters.reduce((sum, matter) => sum + matter.parties.length, 0);

  return (
    <>
      <PageHeader title="Matters on file">
        The firm&apos;s existing files: {matters.length} matters and {names} names. This is what every conflict check searches. In a real firm this list
        would be read from the practice management system. When a client signs an engagement letter here, the new matter joins the list.
      </PageHeader>

      <ul className="space-y-3">
        {matters.map((matter) => (
          <li key={matter.id} className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-serif text-xl leading-snug">{matter.name}</h2>
              <p className="text-[0.8125rem] text-muted">
                {matter.status === "open" ? "Open" : "Closed"}, {matter.practiceArea === "estate" ? "estate planning" : "family law"}, opened{" "}
                {fmtDate(matter.openedOn)}
              </p>
            </div>
            <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {matter.parties.map((party) => (
                <li key={party.id} className="text-[0.9375rem]">
                  <span className="text-[0.8125rem] text-muted">{ROLE[party.role]}</span>
                  <span className="block">{party.name}</span>
                  {party.aliases.length > 0 && <span className="block text-[0.8125rem] text-muted">Also known as {party.aliases.join(", ")}</span>}
                </li>
              ))}
            </ul>
            {matter.leadId && (
              <p className="mt-3 text-sm">
                <Link href={`/staff/leads/${matter.leadId}`} className="font-semibold text-juniper hover:underline">
                  Opened from an inquiry in this app
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
