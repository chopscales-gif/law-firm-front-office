import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "This link has expired" };

/** Shown when a hand-off link is opened after its 15 minutes, or after the demo was reset. */
export default function HandoffExpired() {
  return (
    <main className="mx-auto w-full max-w-[82rem] flex-1 px-5 py-16 sm:px-8 lg:py-24">
      <h1 className="display max-w-[20ch] text-[clamp(2.125rem,4.2vw,3.5rem)]">This link has expired</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
        A link that moves the demo to your phone works for 15 minutes, and stops working if the demo is reset. Make a new one on the first device with
        Continue on your phone, or start the demo fresh on this one.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Open the demo here
      </Link>
    </main>
  );
}
