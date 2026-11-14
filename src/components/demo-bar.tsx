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
    `inline-flex min-h-11 items-center rounded-sm px-3.5 font-semibold sm:min-h-9 ${active ? "bg-white text-demo" : "text-white hover:bg-white/15"}`;

  return (
    <div className="on-dark bg-demo text-[0.9375rem] text-white">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:px-6 lg:px-10">
        <p className="min-w-0 flex-1 basis-64 leading-snug">
          <strong className="font-semibold">Demonstration build.</strong>{" "}
          <span className="text-white/80">Alder &amp; Finch is a fictional firm, the data is invented, and nothing is sent.</span>
        </p>
        <nav aria-label="Demo view" className="flex items-center gap-1 rounded border border-white/30 p-1">
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
        <span className="hidden text-white/70 md:inline">Built by ChopMedia</span>
      </div>
    </div>
  );
}

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-sm px-3 font-semibold underline decoration-white/50 underline-offset-4 hover:decoration-white disabled:opacity-60 sm:min-h-9"
    >
      {pending ? "Resetting" : "Reset demo"}
    </button>
  );
}
