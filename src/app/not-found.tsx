import Link from "next/link";

export default function NotFound() {
  return (
    <main className="w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
      <h1 className="font-serif text-4xl font-medium leading-tight tracking-[-0.015em] sm:text-5xl">That page is not here</h1>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
        The link may be from before the demo data was reset, or from another browser. Each visitor gets their own private copy of the sample data.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          Go to the client side
        </Link>
        <Link href="/staff" className="btn btn-quiet">
          Go to the firm side
        </Link>
      </div>
    </main>
  );
}
