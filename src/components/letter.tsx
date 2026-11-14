import type { Block } from "@/lib/documents/templates";
import { FIRM } from "@/lib/intake";

/** The engagement letter as it reads on screen. The PDF is built from the same blocks. */
export function Letter({ blocks, children }: { blocks: Block[]; children?: React.ReactNode }) {
  return (
    <article className="letter px-6 py-8 sm:px-14 sm:py-14">
      <header className="border-b-2 border-petrol pb-3">
        <p className="font-serif text-2xl font-semibold leading-none text-petrol">{FIRM.name}</p>
        <p className="mt-1.5 text-[0.9375rem] text-muted">
          {FIRM.address}. <span className="whitespace-nowrap">{FIRM.phone}</span>
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
