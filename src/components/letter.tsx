import type { Block } from "@/lib/documents/templates";
import type { Firm } from "@/lib/intake";

/**
 * The engagement letter as it reads on screen. The PDF is built from the same blocks.
 * `firm` is the firm as named on this letter when it was written, not the name showing now.
 */
export function Letter({ firm, blocks, children }: { firm: Firm; blocks: Block[]; children?: React.ReactNode }) {
  return (
    <article className="letter px-6 py-8 sm:px-14 sm:py-14">
      <header className="border-b border-line pb-4">
        <p className="font-serif text-[1.625rem] font-normal leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">{firm.name}</p>
        <p className="mt-1.5 text-[0.9375rem] text-muted">
          {firm.address}. <span className="whitespace-nowrap">{firm.phone}</span>
        </p>
      </header>
      {blocks.map((block, i) =>
        block.type === "heading" ? (
          <h3 key={i}>{block.text}</h3>
        ) : block.type === "list" ? (
          <ul key={i}>{block.items?.map((item) => <li key={item}>{item}</li>)}</ul>
        ) : (
          <p key={i}>{block.text}</p>
        ),
      )}
      {children}
    </article>
  );
}
