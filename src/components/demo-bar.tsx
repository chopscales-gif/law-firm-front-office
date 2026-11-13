"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { resetDemoAction } from "@/server/actions";

/**
 * The strip across the top of every page. It is the only part of the screen
 * that belongs to the demo rather than to the fictional firm's product.
 */
export function DemoBar() {
  const pathname = usePathname();
  const firmSide = pathname.startsWith("/staff");

  const tab = (active: boolean) =>
    `rounded px-3 py-1.5 font-semibold ${active ? "bg-white text-ink" : "text-white/80 hover:text-white"}`;

  return (
    <div className="demo-chrome bg-ink text-sm text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:px-6">
        <p className="min-w-0 flex-1 basis-64 leading-snug">
          <strong className="font-semibold">Demonstration build.</strong>{" "}
          <span className="text-white/75">Alder &amp; Finch is a fictional firm, the data is invented, and nothing is sent.</span>
        </p>
        <nav aria-label="Demo view" className="flex items-center gap-1 rounded-md bg-white/10 p-1">
          <Link href="/" className={tab(!firmSide)} aria-current={!firmSide ? "page" : undefined}>
            Client side
          </Link>
          <Link href="/staff" className={tab(firmSide)} aria-current={firmSide ? "page" : undefined}>
            Firm side
          </Link>
        </nav>
        <form action={resetDemoAction}>
          <ResetButton />
        </form>
        <span className="hidden text-white/60 sm:inline">Built by ChopMedia</span>
      </div>
    </div>
  );
}

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="cursor-pointer rounded border border-white/30 px-3 py-1.5 font-semibold hover:border-white disabled:opacity-60">
      {pending ? "Resetting" : "Reset demo"}
    </button>
  );
}
