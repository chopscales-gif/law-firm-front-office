import type { Metadata } from "next";
import Link from "next/link";
import { HitList } from "@/components/hit-list";
import { OutcomeChip, PageHeader } from "@/components/ui";
import type { Subject } from "@/lib/conflicts/check";
import { SEARCH_EXAMPLES } from "@/lib/conflicts/examples";
import { getCtx } from "@/server/session";
import { searchConflicts } from "@/server/workflow";

export const metadata: Metadata = { title: "Conflict search" };

const ROLES: { key: Subject["role"]; label: string }[] = [
  { key: "prospect", label: "Someone who wants to hire the firm" },
  { key: "adverse", label: "The other side of a new matter" },
  { key: "related", label: "Someone else involved" },
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

      {/* Keyed by the search, so the fields show an example's name and role when one is clicked. */}
      <form key={`${name}|${role}`} action="/staff/conflicts" className="grid max-w-[60rem] gap-4 border-y-2 border-petrol py-5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor="name" className="block font-semibold">
            Name of a person or business
          </label>
          <input id="name" name="name" defaultValue={name} required maxLength={120} autoComplete="off" className="field mt-1.5" />
        </div>
        <div>
          <label htmlFor="role" className="block font-semibold">
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

      <div className="demo-note mt-6 max-w-[60rem] px-4 py-3">
        <p className="font-semibold">Try to fool it</p>
        <p className="text-[0.9375rem] leading-snug text-muted">
          None of these is written the way it is on file. Four should still be found. The last is someone else, and should not be. Or type a name of your own
          above.
        </p>
        <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {SEARCH_EXAMPLES.map((example) => (
            <li key={example.name}>
              <Link
                href={`/staff/conflicts?name=${encodeURIComponent(example.name)}&role=${example.role}`}
                aria-current={example.name === name && example.role === role ? "true" : undefined}
                className="flex h-full min-h-11 flex-col rounded border-[1.5px] border-line px-3 py-2 hover:border-demo aria-[current]:border-demo"
              >
                <span className="font-semibold leading-snug">{example.name}</span>
                <span className="mt-0.5 text-sm leading-snug text-muted">{example.shows}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {result && (
        <section aria-live="polite" className="mt-10 max-w-[60rem]">
          <h2 className="font-serif text-[1.75rem] font-medium leading-tight">Results for {name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <OutcomeChip outcome={result.outcome} />
            <p className="font-semibold">{result.summary}</p>
          </div>
          {result.hits.length > 0 && <p className="mt-1 text-[0.9375rem] text-muted">{result.partiesSearched} names on file searched.</p>}
          <div className="mt-4">
            <HitList hits={result.hits} searched="Your search" />
          </div>
        </section>
      )}
    </>
  );
}
