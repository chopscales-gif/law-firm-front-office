import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cookies are needed" };

/** Shown by the proxy when the sandbox cookie was offered and did not come back. */
export default function CookiesNeeded() {
  return (
    <main className="w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
      <h1 className="font-serif text-4xl font-medium leading-tight tracking-[-0.015em] sm:text-5xl">This demo needs cookies switched on</h1>
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
