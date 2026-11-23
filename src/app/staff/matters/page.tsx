import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { listMatters } from "@/server/queries";
import { getCtx } from "@/server/session";

export const metadata: Metadata = { title: "Matters on file" };

const ROLE = { client: "Client", opposing: "Opposing party", related: "Related" };
const ROLE_TAG = { client: "bg-green-tint text-green", opposing: "bg-flag-tint text-flag", related: "bg-stone text-[#565d5a]" };

export default async function MattersPage() {
  const ctx = await getCtx();
  const matters = await listMatters(ctx);
  const names = matters.reduce((sum, matter) => sum + matter.parties.length, 0);

  return (
    <>
      <PageHeader label="Matters on file" title="The files" accent="every check is run against.">
        The firm&apos;s existing files: {matters.length} matters and {names} names. This is what every conflict check searches. In a real firm this list
        would be read from the practice management system. When a client signs an engagement letter here, the new matter joins the list.
      </PageHeader>

      <ul className="space-y-3">
        {matters.map((matter) => (
          <li
            key={matter.id}
            className={`panel grid gap-x-10 gap-y-4 px-5 py-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}
          >
            <div>
              <h2 className="text-xl font-medium leading-snug tracking-[-0.01em]">{matter.name}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.9375rem] text-muted">
                <span className={`tag ${matter.status === "open" ? "bg-green-tint text-green" : "bg-stone text-[#565d5a]"}`}>
                  {matter.status === "open" ? "Open" : "Closed"}
                </span>
                <span>
                  {matter.practiceArea === "estate" ? "Estate planning" : "Family law"}, opened {fmtDate(matter.openedOn)}
                </span>
              </p>
            </div>
            <ul className="grid content-start gap-x-8 gap-y-4 sm:grid-cols-2">
              {matter.parties.map((party) => (
                <li key={party.id} className="leading-snug">
                  <span className={`tag ${ROLE_TAG[party.role]}`}>{ROLE[party.role]}</span>
                  <span className="mt-1 block text-[1.0625rem] font-semibold">{party.name}</span>
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
