"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/staff", label: "Inquiries", short: "Inquiries" },
  { href: "/staff/conflicts", label: "Conflict search", short: "Conflicts" },
  { href: "/staff/matters", label: "Matters on file", short: "Matters" },
  { href: "/staff/outbox", label: "Outbox", short: "Outbox" },
];

/** Side rail on wide screens, bottom bar on phones. */
export function StaffNav({ outboxCount }: { outboxCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/staff" ? pathname === "/staff" || pathname.startsWith("/staff/leads") : pathname.startsWith(href));

  return (
    <nav
      aria-label="Firm workspace"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface lg:static lg:w-56 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-t-0 lg:p-4"
    >
      <p className="mb-4 hidden px-3 font-serif text-xl leading-tight lg:block">
        Alder &amp; Finch
        <span className="block font-sans text-[0.8125rem] text-muted">Front office</span>
      </p>
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 px-2 py-3 text-sm font-semibold lg:flex-none lg:justify-between lg:rounded-md lg:px-3 lg:py-2 ${
              active ? "text-juniper-deep shadow-[inset_0_2px_0_var(--color-juniper)] lg:bg-juniper-tint lg:shadow-none" : "text-muted hover:text-ink"
            }`}
          >
            <span className="lg:hidden">{item.short}</span>
            <span className="hidden lg:inline">{item.label}</span>
            {item.href === "/staff/outbox" && <span className="hidden rounded-full bg-paper px-2 text-[0.8125rem] tabular-nums text-muted lg:inline">{outboxCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
