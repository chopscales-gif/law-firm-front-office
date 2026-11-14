"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { signAction } from "@/server/actions";

type Kind = "typed" | "drawn";

/** Where the client signs: type a name or draw with a finger or mouse, then agree and sign. */
export function SignPanel({ token, signerName }: { token: string; signerName: string }) {
  const [kind, setKind] = useState<Kind>("typed");
  const [typed, setTyped] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Match the canvas bitmap to its displayed size so strokes land under the pointer.
  useEffect(() => {
    if (kind !== "drawn") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1a2e66";
    setHasInk(false);
  }, [kind]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    setHasInk(true);
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (kind === "typed" && typed.trim().length < 2) return setError("Type your full name to sign.");
    if (kind === "drawn" && !hasInk) return setError("Draw your signature in the box to sign.");
    if (!consent) return setError("Tick the box to agree to sign electronically.");
    const data = kind === "typed" ? typed.trim() : (canvasRef.current?.toDataURL("image/png") ?? "");
    startTransition(async () => {
      const result = await signAction(token, kind, data, consent);
      if (!result.ok) setError(result.error);
    });
  }

  const tab = (active: boolean) =>
    `min-h-11 flex-1 cursor-pointer rounded-sm px-4 font-semibold ${active ? "bg-petrol text-white" : "text-petrol hover:bg-lake-tint"}`;

  return (
    <form onSubmit={submit} className="rounded-lg border-2 border-petrol bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-2xl font-semibold">Sign the letter</h2>
      <p className="mt-1 text-muted">Signing as {signerName}.</p>

      <div role="group" aria-label="How to sign" className="mt-4 flex gap-1 rounded border-[1.5px] border-petrol/45 p-1">
        <button type="button" aria-pressed={kind === "typed"} onClick={() => setKind("typed")} className={tab(kind === "typed")}>
          Type your name
        </button>
        <button type="button" aria-pressed={kind === "drawn"} onClick={() => setKind("drawn")} className={tab(kind === "drawn")}>
          Draw it
        </button>
      </div>

      {kind === "typed" ? (
        <div className="mt-4">
          <label htmlFor="typed-signature" className="block font-semibold">
            Your full name
          </label>
          <input
            id="typed-signature"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={120}
            autoComplete="name"
            className="field mt-1.5"
            placeholder={signerName}
          />
          <p aria-hidden className="mt-3 min-h-14 border-b border-ink pb-1 font-serif text-3xl italic text-[#1a2e66]">
            {typed}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-semibold">Draw your signature</p>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drawing.current = false)}
            onPointerCancel={() => (drawing.current = false)}
            aria-label="Signature drawing area"
            className="mt-1.5 h-40 w-full touch-none rounded border-[1.5px] border-[#7c888e] bg-surface"
          />
          <button type="button" onClick={clearDrawing} className="link mt-1 inline-flex min-h-11 cursor-pointer items-center">
            Clear and start again
          </button>
        </div>
      )}

      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-6 shrink-0 cursor-pointer accent-petrol" />
        <span>I agree to sign this letter electronically, and I understand my electronic signature has the same effect as signing on paper.</span>
      </label>

      {error && (
        <p role="alert" className="mt-3 font-semibold text-flag">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary mt-5 min-h-12 w-full">
        {pending ? "Signing" : "Sign the letter"}
      </button>
    </form>
  );
}
