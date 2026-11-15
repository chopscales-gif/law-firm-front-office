"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { startStoryAction } from "@/server/actions";

/**
 * "Play the story": a little over two minutes, hands off, from a client's first message
 * to an open matter. Nothing here is a recording. The story presses the same
 * buttons a visitor would, in the visitor's own sandbox, and waits for each
 * real result before moving on. It lives in memory only, so a reload or the
 * Back button simply ends it and leaves the app as far along as it got.
 */

/** One sentence per step: what is happening, and why an office would care. */
export const STORY_CAPTIONS = [
  "A new client writes in, at any hour. The assistant takes the details and books a consultation, with no one at the office.",
  "The inquiry is already in the firm's list, scored and summarized, before anyone has picked up a phone.",
  "One click checks every name against the firm's files, including nicknames and former names.",
  "Nothing found, so the attorney clears it. The decision and the time are recorded.",
  "The engagement letter is filled in from the intake answers. Nobody retypes a name or a fee.",
  "It goes out for signature by email. No printing, no scanning.",
  "This is what the client sees on their phone. They read it and sign.",
  "Signed. The matter is open and ready for the practice management system, a couple of minutes after the first message.",
];

/** What the chat offers the story: play these lines through the real chat, and say which inquiry they became. */
export type ChatHandle = { play: (lines: string[], alive: () => boolean) => Promise<string | null> };

/** Set by the chat while it is on screen. */
export const chatHandle: { current: ChatHandle | null } = { current: null };

type Phase = { kind: "idle" } | { kind: "starting" } | { kind: "running"; step: number } | { kind: "ended" } | { kind: "halted" };

type Story = { busy: boolean; error: string | null; start: () => void };

const StoryContext = createContext<Story>({ busy: false, error: null, start: () => {} });

export const useStory = () => useContext(StoryContext);

class Stopped extends Error {}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const find = (marker: string) => document.querySelector<HTMLElement>(`[data-story="${marker}"]`);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** How long the story waits for the app before giving up, far longer than any step takes. */
const PATIENCE_MS = 20_000;
/** Every pause is stretched by this, so each step can be read and followed without hurrying. */
export const STORY_PACE = 1.6;
/** Room left around the part of the page the story is showing, inside the dimmed screen. */
const SPOT_MARGIN = 12;

function clearFocus() {
  document.querySelectorAll(".story-focus").forEach((element) => element.classList.remove("story-focus"));
}

function point(element: HTMLElement, block: ScrollLogicalPosition = "center") {
  clearFocus();
  element.classList.add("story-focus");
  element.scrollIntoView({ block, behavior: reducedMotion() ? "auto" : "smooth" });
}

/** The pointer the story moves, so the eye can follow it from one thing to the next. Set while the story is on screen. */
const pointer: { element: HTMLElement | null; x: number; y: number; on: HTMLElement | null; moving: boolean } = { element: null, x: 0, y: 0, on: null, moving: false };

function placePointer(x: number, y: number) {
  pointer.x = x;
  pointer.y = y;
  if (pointer.element) pointer.element.style.transform = `translate(${x}px, ${y}px)`;
}

/** Where on a thing the pointer lands: just past the middle of a button, so its label stays readable, or the near end of a wide row. */
function aim(target: HTMLElement): [number, number] {
  const rect = target.getBoundingClientRect();
  return [rect.left + Math.min(rect.width * 0.7, 150), rect.top + rect.height * 0.62];
}

/** Moves the pointer onto a thing, tracking it while the page is still scrolling. */
async function glide(target: HTMLElement, alive: () => boolean) {
  if (!pointer.element) return;
  const [fromX, fromY] = [pointer.x, pointer.y];
  const [toX, toY] = aim(target);
  // Further away takes longer, so the pointer never darts.
  const duration = reducedMotion() ? 0 : Math.min(1300, 550 + Math.hypot(toX - fromX, toY - fromY) * 0.7);
  const began = performance.now();
  pointer.moving = true;
  try {
    for (;;) {
      if (!alive() || !target.isConnected) return;
      const t = duration ? Math.min(1, (performance.now() - began) / duration) : 1;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const [x, y] = aim(target);
      placePointer(fromX + (x - fromX) * eased, fromY + (y - fromY) * eased);
      if (t === 1) break;
      await new Promise(requestAnimationFrame);
    }
    // Once there it stays on the thing, even if the page scrolls underneath.
    pointer.on = target;
  } finally {
    pointer.moving = false;
  }
}

/** Shows the pointer pressing down, just before the story presses the real thing. */
async function tap(target: HTMLElement) {
  const element = pointer.element;
  if (!element) return;
  if (target.isConnected) placePointer(...aim(target));
  element.classList.remove("story-tap");
  void element.offsetWidth;
  element.classList.add("story-tap");
  await wait(reducedMotion() ? 0 : 420);
}

/** Types into a field the way a person would, so the page's own handlers see every change. */
async function typeInto(input: HTMLInputElement, text: string, alive: () => boolean) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  const steps = reducedMotion() ? [text] : Array.from(text, (_, i) => text.slice(0, i + 1));
  for (const value of steps) {
    if (!alive()) return;
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (steps.length > 1) await wait(75);
  }
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  // Refs hold what the story needs between awaits, where state would be stale.
  const run = useRef(0);
  const path = useRef(pathname);
  const expected = useRef(pathname);
  const active = useRef(false);
  const stopButton = useRef<HTMLButtonElement>(null);
  const closingControl = useRef<HTMLAnchorElement & HTMLButtonElement>(null);

  const finish = useCallback((next: Phase) => {
    run.current += 1;
    active.current = false;
    clearFocus();
    setPhase(next);
  }, []);

  const stop = useCallback(() => {
    finish({ kind: "idle" });
    // The play button is disabled until the next render, and a disabled button cannot take focus.
    setTimeout(() => document.querySelector<HTMLElement>('[data-story="play"]')?.focus({ preventScroll: true }));
  }, [finish]);

  useEffect(() => {
    path.current = pathname;
    // A page change the story did not make (Back, say) hands the app back to the visitor.
    if (active.current && pathname !== expected.current) finish({ kind: "idle" });
  }, [pathname, finish]);

  const running = phase.kind === "running";
  const closing = phase.kind === "ended" || phase.kind === "halted";

  // The closing panel is about the page the story ended on, so it goes when the visitor moves on.
  const endedOn = useRef<string | null>(null);
  useEffect(() => {
    if (!closing) endedOn.current = null;
    else if (endedOn.current === null) endedOn.current = pathname;
    else if (endedOn.current !== pathname) setPhase({ kind: "idle" });
  }, [closing, pathname]);

  // The panel sits over the foot of the page, so the page grows by its height and nothing is left underneath it.
  // On the firm side the room is added inside the page, so the rail beside it still reaches the bottom.
  const shown = running || closing;
  useEffect(() => {
    if (!shown) return;
    const page = (pathname.startsWith("/staff") && document.querySelector("main")) || document.body;
    page.style.paddingBottom = "13rem";
    return () => void (page.style.paddingBottom = "");
  }, [shown, pathname]);

  // When the story ends, the keyboard lands on what to do next.
  useEffect(() => {
    if (closing) closingControl.current?.focus({ preventScroll: true });
  }, [closing]);

  useEffect(() => {
    if (!running) return;
    stopButton.current?.focus();
    // While the story runs, Stop is the only control: Escape presses it and Tab stays on it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
      else if (event.key === "Tab") {
        event.preventDefault();
        stopButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [running, stop]);

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setError(null);
    setPhase({ kind: "starting" });
    const generation = ++run.current;
    const alive = () => run.current === generation;

    const check = () => {
      if (!alive()) throw new Stopped();
    };
    const pause = async (ms: number) => {
      await wait(ms * STORY_PACE);
      check();
    };
    /** Waits for the app to show something, however long the server takes, and gives up only when it clearly will not. */
    const until = async <T,>(look: () => T | null | undefined | false): Promise<T> => {
      const deadline = Date.now() + PATIENCE_MS;
      for (;;) {
        check();
        const found = look();
        if (found) return found;
        if (Date.now() > deadline) throw new Error("The app did not show the next step.");
        await wait(100);
      }
    };
    const go = async (to: string) => {
      if (path.current === to) return;
      expected.current = to;
      router.push(to);
      await until(() => path.current === to);
    };
    /** Lights a thing, walks the pointer to it, leaves time to read, then shows the press. The caller does the real press. */
    const reach = async (target: HTMLElement, readFor: number, block: ScrollLogicalPosition = "center") => {
      point(target, block);
      await pause(500);
      await glide(target, alive);
      await pause(readFor);
      await tap(target);
      check();
    };
    const press = async (marker: string, readFor: number) => {
      const button = await until(() => {
        const element = find(marker);
        return element && !(element as HTMLButtonElement).disabled ? element : null;
      });
      await reach(button, readFor);
      button.click();
    };
    /** Follows a link the way a visitor would: the pointer goes to it and presses, and then the page changes. */
    const follow = async (link: HTMLElement, to: string, readFor: number) => {
      await reach(link, readFor);
      await go(to);
      clearFocus();
      // A beat with the whole new page lit, before the light narrows onto one part of it.
      await pause(1100);
    };
    const step = (n: number) => setPhase({ kind: "running", step: n });

    try {
      const cast = await startStoryAction();
      check();
      if (!cast.ok) {
        active.current = false;
        setPhase({ kind: "idle" });
        setError(cast.error);
        return;
      }
      expected.current = path.current;

      step(1);
      await go("/");
      const chat = await until(() => chatHandle.current);
      await pause(900);
      const sheet = find("chat");
      if (sheet) point(sheet, "nearest");
      const field = document.getElementById("chat-input");
      if (field) {
        await pause(500);
        await glide(field, alive);
        await tap(field);
      }
      await pause(700);
      const leadId = await chat.play(cast.messages, alive);
      check();
      if (!leadId) throw new Error("The conversation did not finish.");
      await pause(2200);

      const firmSide = document.querySelector<HTMLElement>('nav[aria-label="Demo view"] a[href="/staff"]');
      if (firmSide) await follow(firmSide, "/staff", 900);
      step(2);
      await go("/staff");
      const row = await until(() => document.querySelector<HTMLElement>(`[data-story-lead="${leadId}"]`));
      point(row);
      await pause(4600);

      await follow(row, `/staff/leads/${leadId}`, 600);
      step(3);
      await press("run-check", 4200);
      point(await until(() => find("check-result")));
      await pause(2800);

      step(4);
      await press("clear", 4400);
      await until(() => find("prepare-letter"));

      step(5);
      await press("prepare-letter", 1800);
      point(await until(() => find("letter")), "start");
      await pause(4600);

      step(6);
      await press("send-letter", 3800);
      const signing = await until(() => find("open-signing"));
      const signingPath = signing.getAttribute("href");
      if (!signingPath) throw new Error("The signing link is missing.");
      await follow(signing, signingPath, 2000);

      step(7);
      const form = await until(() => find("sign-form"));
      point(form);
      await pause(2600);
      const name = form.querySelector<HTMLInputElement>("#typed-signature");
      const consent = form.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const sign = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!name || !consent || !sign) throw new Error("The signing form is missing.");
      await glide(name, alive);
      await tap(name);
      await typeInto(name, cast.name, alive);
      await pause(600);
      await glide(consent, alive);
      await tap(consent);
      if (!consent.checked) consent.click();
      await pause(900);
      await glide(sign, alive);
      await pause(500);
      await tap(sign);
      check();
      sign.click();
      const signedNote = await until(() => find("signed"));
      point(signedNote);
      await pause(3000);

      const back = signedNote.querySelector<HTMLElement>(`a[href="/staff/leads/${leadId}"]`);
      if (back) await follow(back, `/staff/leads/${leadId}`, 700);
      step(8);
      await go(`/staff/leads/${leadId}`);
      const matter = await until(() => find("matter"));
      clearFocus();
      matter.classList.add("story-focus");
      // The last step stays on screen with the closing panel over the foot of the window, so the matter is placed just above it.
      const box = (matter.closest("li") ?? matter).getBoundingClientRect();
      // The closing panel stacks its buttons on a phone, so it is taller there.
      const room = window.innerHeight - (window.innerWidth < 640 ? 256 : 208);
      window.scrollTo({ top: window.scrollY + (box.height > room ? box.top - 16 : box.bottom - room), behavior: reducedMotion() ? "auto" : "smooth" });
      await pause(2400);
      if (alive()) finish({ kind: "ended" });
    } catch (problem) {
      if (problem instanceof Stopped || !alive()) return;
      console.error(problem);
      finish({ kind: "halted" });
    }
  }, [router, finish]);

  const story = useMemo<Story>(() => ({ busy: phase.kind === "starting" || running, error, start: () => void start() }), [phase.kind, running, error, start]);

  return (
    <StoryContext.Provider value={story}>
      {children}
      {running && <Spotlight />}
      {(running || closing) && (
        <section aria-label="The story" className="on-dark rise-in fixed inset-x-2 bottom-2 z-50 mx-auto max-w-[46rem] rounded-lg bg-demo px-4 py-3.5 text-white shadow-[0_12px_40px_-8px_rgba(16,23,27,0.7)] sm:bottom-5 sm:px-5 sm:py-4">
          {phase.kind === "running" && (
            <div className="flex items-center gap-4">
              <div aria-live="polite" className="min-w-0 flex-1">
                <p className="text-[0.9375rem] text-white/75">
                  Demonstration build. Step {phase.step} of {STORY_CAPTIONS.length}
                </p>
                <p className="mt-0.5 text-[1.0625rem] font-semibold leading-snug sm:text-lg">{STORY_CAPTIONS[phase.step - 1]}</p>
              </div>
              <button ref={stopButton} type="button" onClick={stop} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-sm border-[1.5px] border-white px-4 font-semibold hover:bg-white/15">
                Stop
              </button>
            </div>
          )}
          {phase.kind === "ended" && (
            <div>
              <p className="text-[0.9375rem] text-white/75">Demonstration build. The story, finished</p>
              <p className="mt-0.5 text-[1.0625rem] font-semibold leading-snug sm:text-lg">{STORY_CAPTIONS[STORY_CAPTIONS.length - 1]}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link ref={closingControl} href="/about" className="inline-flex min-h-11 items-center rounded-sm bg-white px-4 font-semibold text-demo hover:bg-white/85">
                  What you just saw
                </Link>
                <button type="button" onClick={stop} className="inline-flex min-h-11 cursor-pointer items-center rounded-sm border-[1.5px] border-white px-4 font-semibold hover:bg-white/15">
                  Close and look around
                </button>
              </div>
            </div>
          )}
          {phase.kind === "halted" && (
            <div role="alert">
              <p className="text-[1.0625rem] font-semibold leading-snug">The story stopped because the app took too long to answer.</p>
              <p className="mt-0.5 text-[0.9375rem] text-white/85">Everything up to here is saved, so you can carry on by hand from this page.</p>
              <button ref={closingControl} type="button" onClick={stop} className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-sm border-[1.5px] border-white px-4 font-semibold hover:bg-white/15">
                Close
              </button>
            </div>
          )}
        </section>
      )}
    </StoryContext.Provider>
  );
}

/**
 * The walkthrough's dimmed screen. Everything is greyed except the part the
 * story is showing, which the light follows as the page scrolls and changes.
 * It also holds the mouse, so a stray click cannot send the app somewhere the
 * story is not.
 */
function Spotlight() {
  const light = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = light.current;
    if (!element) return;
    const still = reducedMotion();
    let box: [number, number, number, number] | null = null;
    let frame = 0;

    const follow = () => {
      frame = requestAnimationFrame(follow);
      if (!pointer.moving && pointer.on?.isConnected) placePointer(...aim(pointer.on));
      const target = document.querySelector<HTMLElement>(".story-focus");
      // With nothing picked out yet, as on a page that has just opened, the light widens to the whole window.
      const rect = target?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      const want: [number, number, number, number] = [rect.left - SPOT_MARGIN, rect.top - SPOT_MARGIN, rect.width + 2 * SPOT_MARGIN, rect.height + 2 * SPOT_MARGIN];
      // The light glides to a new place, and keeps up with the page while it scrolls.
      box = box && !still ? (box.map((value, i) => value + (want[i] - value) * 0.16) as typeof want) : want;
      element.style.transform = `translate(${box[0]}px, ${box[1]}px)`;
      element.style.width = `${box[2]}px`;
      element.style.height = `${box[3]}px`;
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, []);

  const arrow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pointer.element = arrow.current;
    placePointer(window.innerWidth / 2, window.innerHeight / 2);
    return () => void (pointer.element = pointer.on = null);
  }, []);

  return (
    <div aria-hidden className="story-dim fixed inset-0 z-40 overflow-hidden">
      <div ref={light} className="story-light" />
      <div ref={arrow} className="story-pointer">
        <span />
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M5 2.5v17.2l4.6-4.3 3 6.6 2.9-1.3-3-6.5h6.3z" fill="#10171b" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
