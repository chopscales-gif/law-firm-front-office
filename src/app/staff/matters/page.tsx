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

      <ul className="border-t-2 border-plum">
        {matters.map((matter) => (
          <li key={matter.id} className="grid gap-x-10 gap-y-3 border-b border-line py-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div>
              <h2 className="font-serif text-xl font-semibold leading-snug">{matter.name}</h2>
              <p className="mt-1 text-[0.9375rem] text-muted">
                {matter.status === "open" ? "Open" : "Closed"}, {matter.practiceArea === "estate" ? "estate planning" : "family law"}, opened{" "}
                {fmtDate(matter.openedOn)}
              </p>
            </div>
            <ul className="grid content-start gap-x-8 gap-y-3 sm:grid-cols-2">
              {matter.parties.map((party) => (
                <li key={party.id} className="leading-snug">
                  <span className="text-[0.9375rem] text-muted">{ROLE[party.role]}</span>
                  <span className="block">{party.name}</span>
                  {party.aliases.length > 0 && <span className="block text-[0.9375rem] text-muted">Also known as {party.aliases.join(", ")}</span>}
                </li>
              ))}
            </ul>
            {matter.leadId && (
              <p className="lg:col-start-2">
                <Link href={`/staff/leads/${matter.leadId}`} className="link inline-flex min-h-11 items-center lg:min-h-0">
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
