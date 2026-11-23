"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[82rem] flex-1 px-5 py-16 sm:px-8 lg:py-24">
      <h1 className="display max-w-[20ch] text-[clamp(2.125rem,4.2vw,3.5rem)]">Something went wrong loading this page</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
        Try again. If it keeps happening, use Reset demo in the bar at the top to start from a fresh copy of the sample data. This demo needs cookies
        turned on to keep your copy separate from other visitors.
      </p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        Try again
      </button>
    </main>
  );
}
