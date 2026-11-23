"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { FIRM, FIRM_NAME_MAX, type Firm } from "@/lib/intake";
import { resetDemoAction, setFirmNameAction } from "@/server/actions";
import { HandoffCard } from "./handoff";
import { useStory } from "./story";

const control = "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 font-medium sm:min-h-9";
const outlined = `${control} border border-edge hover:border-forest disabled:cursor-not-allowed disabled:opacity-60`;
const plain = `${control} text-muted hover:bg-stone hover:text-ink disabled:opacity-60`;
const underlined = `${control} underline decoration-edge underline-offset-4 hover:decoration-ink disabled:opacity-60`;

/**
 * The strip across the top of every page. It is the only part of the screen
 * that belongs to the demo rather than to the firm's product: it says what this
 * is, then holds the things a visitor can try. One row on a laptop.
 */
export function DemoBar({ firm }: { firm: Firm }) {
  const pathname = usePathname();
  const firmSide = pathname.startsWith("/staff");
  const clientSide = pathname === "/" || pathname.startsWith("/sign/");
  const story = useStory();
  const bar = useRef<HTMLDivElement>(null);

  // The client page fills the window below the bar, so it needs to know how tall the bar is.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty("--demo-bar-h", `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tab = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-3.5 font-medium sm:min-h-8 ${active ? "bg-surface text-ink shadow-rest" : "text-muted hover:text-ink"}`;

  return (
    <div ref={bar} className="border-b border-line bg-surface text-[0.9375rem] text-ink">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 px-4 py-2 sm:px-6 sm:py-1.5">
        <p className="min-w-0 flex-1 basis-64 pr-3 leading-snug">
          <span aria-hidden className="mr-2 inline-block size-1.5 rounded-full bg-green align-middle" />
          <strong className="font-semibold">Demonstration build.</strong>{" "}
          <span className="text-muted">
            {/* A visitor's own firm is real, so with their name showing the bar says whose data is invented, and never that the firm is. */}
            {firm.custom
              ? "Your firm's name is shown on invented sample data. Nothing is sent."
              : `${FIRM.shortName} is a fictional firm, the data is invented, and nothing is sent.`}
          </span>{" "}
          <span className="hidden text-faint 2xl:inline">Built by ChopMedia.</span>{" "}
          {/* On a phone there is no room for this link among the controls, so it closes the sentence. */}
          <Link href="/about" className="whitespace-nowrap font-semibold underline decoration-edge underline-offset-4 md:hidden">
            About this demo
          </Link>
        </p>
        {/* Last on a laptop, where it ends the strip. On a phone it stays beside the notice. */}
        <nav aria-label="Demo view" className="flex items-center gap-0.5 rounded-full bg-stone p-1 lg:order-last lg:ml-2">
          <Link href="/" className={tab(!firmSide)} aria-current={!firmSide ? "page" : undefined}>
            Client side
          </Link>
          <Link href="/staff" className={tab(firmSide)} aria-current={firmSide ? "page" : undefined}>
            Firm side
          </Link>
        </nav>
        <button
          type="button"
          data-story="play"
          onClick={story.start}
          disabled={story.busy}
          className={`${control} gap-2 bg-forest px-4 text-white hover:bg-fern disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-current">
            <path d="M2 1l9 5-9 5z" />
          </svg>
          {story.busy ? "Playing the story" : "Play the story"}
        </button>
        <FirmName key={firm.custom ? firm.name : ""} firm={firm} />
        {clientSide && <PhoneHandoff path={pathname} />}
        <Link href="/about" aria-current={pathname === "/about" ? "page" : undefined} className={`${plain} max-md:hidden`}>
          About
        </Link>
        <form action={resetDemoAction}>
          <ResetButton />
        </form>
        {story.error && (
          <p role="alert" className="order-last basis-full pb-1 font-semibold text-flag">
            {story.error}
          </p>
        )}
      </div>
    </div>
  );
}

/** The one question the demo asks: the visitor's firm name, shown in place of the fictional firm's. */
function FirmName({ firm }: { firm: Firm }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(name: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await setFirmNameAction(name);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      setDraft("");
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return setError("Type your firm's name first.");
    save(draft);
  }

  if (firm.custom && !editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
        <p className="min-w-0 max-w-full px-1 leading-snug sm:max-w-[26rem] sm:truncate" title={firm.name}>
          <span className="text-muted">Shown as </span>
          <strong className="font-semibold [overflow-wrap:anywhere]">{firm.name}</strong>
        </p>
        <button type="button" onClick={() => setEditing(true)} disabled={pending} className={underlined}>
          Change
        </button>
        <button type="button" onClick={() => save(null)} disabled={pending} className={underlined}>
          {pending ? "Putting it back" : `Back to ${FIRM.shortName}`}
        </button>
        {error && (
          <p role="alert" className="basis-full font-semibold text-flag">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* The question folds into one button, so the bar stays one row until it is asked. */}
      {!editing && (
        <button type="button" onClick={() => setEditing(true)} className={plain}>
          Use your firm&apos;s name
        </button>
      )}
      <form onSubmit={submit} className={`min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 ${editing ? "order-last flex basis-full pb-1" : "hidden"}`}>
        <label htmlFor="firm-name" className="font-semibold">
          What&apos;s your firm called?
        </label>
        <input
          id="firm-name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={FIRM_NAME_MAX}
          autoComplete="organization"
          placeholder="Optional"
          aria-describedby={error ? "firm-name-error" : undefined}
          className="min-h-11 w-full min-w-0 rounded-full border border-edge bg-white px-4 text-base text-ink placeholder:text-[#565d5a] sm:min-h-9 sm:w-64"
        />
        <button type="submit" disabled={pending} className={outlined}>
          {pending ? "Showing it" : "Show it"}
        </button>
        {editing && (
          <button type="button" onClick={() => (setEditing(false), setError(null), setDraft(""))} className={underlined}>
            Cancel
          </button>
        )}
        {error && (
          <p id="firm-name-error" role="alert" className="basis-full font-semibold text-flag">
            {error}
          </p>
        )}
      </form>
    </>
  );
}

/** "Continue on your phone": moves the page the visitor is on to a second device. Not offered on a phone. */
function PhoneHandoff({ path }: { path: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
    dialog.current?.showModal();
  }

  return (
    <>
      <button type="button" onClick={show} className={`${plain} max-md:hidden`}>
        Continue on your phone
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="handoff-title"
        className="demo-dialog demo-note m-auto w-[min(34rem,calc(100vw-2rem))] p-6 text-base text-ink"
      >
        <h2 id="handoff-title" className="font-serif text-2xl font-normal leading-tight">
          Continue on your phone
        </h2>
        <div className="mt-4">
          {open && (
            <HandoffCard path={path}>
              Point your phone&apos;s camera at the code. This page opens on your phone with the same sample data, and anything you do there shows up here.
            </HandoffCard>
          )}
        </div>
        <form method="dialog" className="mt-5 flex justify-end">
          <button type="submit" className="btn btn-quiet">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}

function ResetButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={plain}>
      {pending ? "Resetting" : "Reset demo"}
    </button>
  );
}
