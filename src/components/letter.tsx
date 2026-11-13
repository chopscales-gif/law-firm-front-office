import type { Block } from "@/lib/documents/templates";
import { FIRM } from "@/lib/intake";

/** The engagement letter as it reads on screen. The PDF is built from the same blocks. */
export function Letter({ blocks, children }: { blocks: Block[]; children?: React.ReactNode }) {
  return (
    <article className="letter rounded-sm border border-line bg-surface px-6 py-8 shadow-[0_10px_30px_-20px_rgba(22,32,43,0.5)] sm:px-12 sm:py-12">
      <header className="border-b border-juniper pb-3">
        <p className="text-2xl leading-none text-juniper-deep">{FIRM.name}</p>
        <p className="mt-1 font-sans text-[0.8125rem] text-muted">
          {FIRM.address}. {FIRM.phone}
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
