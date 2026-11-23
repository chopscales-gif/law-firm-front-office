import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cookies are needed" };

/** Shown by the proxy when the sandbox cookie was offered and did not come back. */
export default function CookiesNeeded() {
  return (
    <main className="mx-auto w-full max-w-[82rem] flex-1 px-5 py-16 sm:px-8 lg:py-24">
      <h1 className="display max-w-[20ch] text-[clamp(2.125rem,4.2vw,3.5rem)]">This demo needs cookies switched on</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
        Every visitor gets a private copy of the sample data, so that what you try here is yours alone. One cookie remembers which copy is yours.
        It holds a random id and nothing about you, and it expires after two days.
      </p>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">Allow cookies for this site, then open the demo again.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Open the demo
      </Link>
    </main>
  );
}
