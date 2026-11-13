import type { Metadata } from "next";
import Link from "next/link";
import { HitList } from "@/components/hit-list";
import { OutcomeChip, PageHeader } from "@/components/ui";
import type { Subject } from "@/lib/conflicts/check";
import { getCtx } from "@/server/session";
import { searchConflicts } from "@/server/workflow";

export const metadata: Metadata = { title: "Conflict search" };

const ROLES: { key: Subject["role"]; label: string }[] = [
  { key: "prospect", label: "Someone who wants to hire the firm" },
  { key: "adverse", label: "The other side of a new matter" },
  { key: "related", label: "Someone else involved" },
];

/** Names that show what the search copes with. Each one is spelled differently from the file. */
const EXAMPLES: { name: string; role: Subject["role"]; shows: string }[] = [
  { name: "Kate Reyes", role: "adverse", shows: "a nickname and a former name" },
  { name: "Bill Thornton", role: "prospect", shows: "a nickname for an opposing party" },
  { name: "Jose Hernandez", role: "adverse", shows: "accents left off" },
  { name: "Sara Timczak", role: "adverse", shows: "a misspelling" },
  { name: "WRPM", role: "prospect", shows: "a business known by its initials" },
  { name: "Peggy Lindqvist", role: "related", shows: "the name someone goes by" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ConflictSearchPage({ searchParams }: PageProps<"/staff/conflicts">) {
  const params = await searchParams;
  const name = (first(params.name) ?? "").trim().slice(0, 120);
  const role = ROLES.find((r) => r.key === first(params.role))?.key ?? "prospect";

  const ctx = await getCtx();
  const result = name ? await searchConflicts(ctx, [{ name, role }]) : null;

  return (
    <>
      <PageHeader title="Conflict search">
        Check any name against every client, opposing party and related name on file. The search allows for nicknames, former names, misspellings and
        business names written differently. It finds matches for a lawyer to assess. It does not decide whether a conflict exists.
      </PageHeader>

      <form action="/staff/conflicts" className="panel grid gap-4 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end sm:p-5">
        <div>
          <label htmlFor="name" className="block text-sm font-semibold">
            Name of a person or business
          </label>
          <input id="name" name="name" defaultValue={name} required maxLength={120} autoComplete="off" className="field mt-1.5" />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-semibold">
            Who they are
          </label>
          <select id="role" name="role" defaultValue={role} className="field mt-1.5">
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Search the files
        </button>
      </form>

      <div className="mt-4">
        <p className="text-sm font-semibold">Names to try</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <li key={example.name}>
              <Link
                href={`/staff/conflicts?name=${encodeURIComponent(example.name)}&role=${example.role}`}
                className="inline-flex flex-col rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink"
              >
                <span className="font-semibold">{example.name}</span>
                <span className="text-[0.8125rem] text-muted">{example.shows}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {result && (
        <section aria-live="polite" className="mt-8">
          <h2 className="font-serif text-2xl">Results for {name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <OutcomeChip outcome={result.outcome} />
            <p className="text-[0.9375rem]">{result.summary}</p>
          </div>
          <p className="mt-1 text-[0.8125rem] text-muted">{result.partiesSearched} names on file searched.</p>
          <div className="mt-4">
            <HitList hits={result.hits} />
          </div>
        </section>
      )}
    </>
  );
}
