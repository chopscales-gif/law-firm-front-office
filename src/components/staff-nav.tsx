"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/staff", label: "Inquiries" },
  { href: "/staff/conflicts", label: "Conflict search" },
  { href: "/staff/matters", label: "Matters on file" },
  { href: "/staff/outbox", label: "Outbox" },
];

/** The firm's own header: its name set as on the client side, then the four places a member of staff goes. */
export function StaffNav({ firmName, outboxCount }: { firmName: string; outboxCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/staff" ? pathname === "/staff" || pathname.startsWith("/staff/leads") : pathname.startsWith(href));

  return (
    <header className="mx-auto flex w-full max-w-[82rem] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-5 sm:px-8">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 font-serif text-[1.5625rem] leading-none tracking-[-0.01em] [overflow-wrap:anywhere]">
        {firmName}
        <span className="font-sans text-[0.9375rem] font-medium tracking-normal text-faint">Front office</span>
      </p>
      <nav aria-label="Firm workspace" className="-mx-2 flex max-w-[calc(100%+1rem)] gap-1 overflow-x-auto px-2 py-1 text-[0.9375rem] font-medium">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 sm:min-h-9 ${active ? "bg-stone text-ink" : "text-muted hover:bg-stone hover:text-ink"}`}
            >
              {item.label}
              {item.href === "/staff/outbox" && <span className="tabular-nums text-faint">{outboxCount}</span>}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
