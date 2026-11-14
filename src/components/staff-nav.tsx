"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/staff", label: "Inquiries", short: "Inquiries" },
  { href: "/staff/conflicts", label: "Conflict search", short: "Conflicts" },
  { href: "/staff/matters", label: "Matters on file", short: "Matters" },
  { href: "/staff/outbox", label: "Outbox", short: "Outbox" },
];

/** The petrol rail on wide screens, the same spine the client side opens with. A bottom bar on phones. */
export function StaffNav({ outboxCount }: { outboxCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/staff" ? pathname === "/staff" || pathname.startsWith("/staff/leads") : pathname.startsWith(href));

  return (
    <nav
      aria-label="Firm workspace"
      className="on-dark fixed inset-x-0 bottom-0 z-10 flex bg-petrol text-white lg:static lg:w-60 lg:shrink-0 lg:flex-col lg:px-4 lg:py-8"
    >
      <p className="mb-8 hidden px-3 font-serif text-[1.375rem] font-semibold leading-tight lg:block">
        Alder &amp; Finch
        <span className="mt-1 block font-sans text-[0.9375rem] font-normal text-white/75">Front office</span>
      </p>
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 items-center justify-center gap-2 px-2 text-[0.9375rem] font-semibold lg:min-h-11 lg:flex-none lg:justify-between lg:rounded-sm lg:px-3 lg:text-base ${
              active
                ? "bg-petrol-deep shadow-[inset_0_3px_0_var(--color-lake-pale)] lg:shadow-[inset_3px_0_0_var(--color-lake-pale)]"
                : "text-white/80 hover:bg-petrol-deep/60 hover:text-white"
            }`}
          >
            <span className="lg:hidden">{item.short}</span>
            <span className="hidden lg:inline">{item.label}</span>
            {item.href === "/staff/outbox" && <span className="hidden text-[0.9375rem] font-normal tabular-nums text-white/75 lg:inline">{outboxCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
