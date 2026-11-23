"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/db/schema";
import type { Scenario } from "@/lib/chat/scenarios";
import { endChatAction, sendChatAction, type ChatView } from "@/server/actions";
import { liveRefresh } from "./live-updates";
import { chatHandle, STORY_PACE } from "./story";

type Props = {
  /** Read out with the sheet's title; the greeting names the firm in full. */
  firmName: string;
  opening: ChatMessage[];
  openingSuggestions: string[];
  disclaimer: string;
  scenarios: Scenario[];
  /** Questions that ask for legal advice, offered so a visitor can watch the assistant decline. */
  adviceQuestions: string[];
  /** An unfinished conversation from before a reload, or from the visitor's other device. */
  restored: { sessionId: string; messages: ChatMessage[]; suggestions: string[] } | null;
};

const GUARDRAIL_NOTE = {
  advice: "Guardrail: declined to give legal advice",
  safety: "Guardrail: safety concern flagged for staff",
};

/** What `playing` holds while "Play the story" is using the chat. */
const STORY = "story";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Chat({ firmName, opening, openingSuggestions, disclaimer, scenarios, adviceQuestions, restored }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? opening);
  const [suggestions, setSuggestions] = useState<string[]>(restored?.suggestions ?? openingSuggestions);
  const [status, setStatus] = useState<"collecting" | "complete" | "outside">("collecting");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Refs hold what a scripted scenario needs between awaits, where state would be stale.
  const sessionId = useRef<string | null>(restored?.sessionId ?? null);
  const unfinished = useRef(restored !== null);
  const run = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  // A scripted line longer than the box keeps its newest letters in view, as it would for someone typing.
  useEffect(() => {
    if (playing && input.current) input.current.scrollLeft = input.current.scrollWidth;
  }, [draft, playing]);

  // The greeting names the firm. If the visitor changes that name before saying anything, the greeting follows it.
  const greeting = opening.map((message) => message.text).join("\n");
  useEffect(() => {
    if (sessionId.current) return;
    setMessages((all) => (all.some((message) => message.role === "visitor") ? all : opening));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `opening` is a new array on every render; its text is what matters
  }, [greeting]);

  // During a hand-off the visitor's other device may carry the conversation on, finish it or abandon it.
  // When a redraw prompted by that device brings a different conversation, this one follows it.
  const restoredKey = restored ? `${restored.sessionId}:${restored.messages.length}` : "";
  useEffect(() => {
    if (Date.now() - liveRefresh.at > 5000 || pending || playing) return;
    if (restored) {
      if (restored.sessionId === sessionId.current && restored.messages.length <= messages.length) return;
      sessionId.current = restored.sessionId;
      unfinished.current = true;
      setMessages(restored.messages);
      setSuggestions(restored.suggestions);
    } else if (sessionId.current && unfinished.current) {
      sessionId.current = null;
      unfinished.current = false;
      setMessages(opening);
      setSuggestions(openingSuggestions);
    } else return;
    setStatus("collecting");
    setLeadId(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new conversation from the server matters, not this device's own typing
  }, [restoredKey]);

  function restart() {
    run.current += 1;
    // An abandoned conversation is forgotten on the server too, so a reload does not bring it back.
    if (sessionId.current && unfinished.current) void endChatAction(sessionId.current);
    unfinished.current = false;
    sessionId.current = null;
    setMessages(opening);
    setSuggestions(openingSuggestions);
    setStatus("collecting");
    setLeadId(null);
    setError(null);
    setPlaying(null);
    setPending(false);
  }

  /** Sends one message. Returns null if it failed or the conversation was restarted meanwhile. */
  async function send(text: string, token = run.current): Promise<ChatView | null> {
    setError(null);
    setPending(true);
    setSuggestions([]);
    setMessages((all) => [...all, { role: "visitor", text }]);
    const result = await sendChatAction(sessionId.current, text);
    if (token !== run.current) return null;
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return null;
    }
    setPending(false);
    sessionId.current = result.view.sessionId;
    unfinished.current = result.view.status === "collecting";
    // Replies arrive one at a time, as they would from someone writing them, so each can be read as it lands.
    const replies = result.view.added.filter((m) => m.role === "assistant");
    for (const [i, reply] of replies.entries()) {
      if (i > 0 && !still()) {
        setPending(true);
        await wait(700);
        if (token !== run.current) return null;
        setPending(false);
      }
      setMessages((all) => [...all, reply]);
    }
    setSuggestions(result.view.suggestions);
    setStatus(result.view.status);
    setLeadId(result.view.leadId);
    return result.view;
  }

  /** Writes a scripted line into the box a letter at a time, so it is plainly the client typing. False if the script was stopped meanwhile. */
  async function typeOut(line: string, going: () => boolean): Promise<boolean> {
    if (still()) setDraft(line);
    else
      for (let i = 1; i <= line.length; i++) {
        setDraft(line.slice(0, i));
        // A person is not a metronome: a breath after each word.
        await wait(line[i - 1] === " " ? 70 : 34);
        if (!going()) return false;
      }
    await wait(420);
    if (!going()) return false;
    setDraft("");
    return true;
  }

  async function play(scenario: Scenario) {
    restart();
    const token = run.current;
    setPlaying(scenario.key);
    for (const message of scenario.messages) {
      await wait(650);
      if (token !== run.current) return;
      if (!(await typeOut(message, () => token === run.current))) return;
      const view = await send(message, token);
      if (!view) break;
      await wait(Math.min(1400, 300 + 9 * view.added.reduce((length, m) => length + (m.role === "assistant" ? m.text.length : 0), 0)));
    }
    if (token === run.current) setPlaying(null);
  }

  /**
   * "Play the story" sends its client's lines through this same chat, each one
   * typed into the box before it goes, with a pause to read the reply. Returns
   * the inquiry the conversation became, or null if it was stopped or failed.
   */
  async function playStory(lines: string[], alive: () => boolean): Promise<string | null> {
    restart();
    const token = run.current;
    const going = () => alive() && token === run.current;
    setPlaying(STORY);
    section.current?.scrollIntoView({ block: "start", behavior: still() ? "auto" : "smooth" });
    let lead: string | null = null;
    for (const line of lines) {
      await wait(450 * STORY_PACE);
      if (!going()) break;
      if (!(await typeOut(line, going))) break;
      const view = await send(line, token);
      if (!view) break;
      lead = view.leadId;
      // Long enough to read the reply, short enough that nobody waits on it.
      await wait(STORY_PACE * Math.min(1700, 300 + 12 * view.added.reduce((length, m) => length + (m.role === "assistant" ? m.text.length : 0), 0)));
    }
    if (token === run.current) {
      setDraft("");
      setPlaying(null);
    }
    return going() ? lead : null;
  }

  // Latest version of playStory for the story to call, without re-registering on every render.
  const story = useRef(playStory);
  useEffect(() => {
    story.current = playStory;
  });
  useEffect(() => {
    const handle = { play: (lines: string[], alive: () => boolean) => story.current(lines, alive) };
    chatHandle.current = handle;
    return () => {
      if (chatHandle.current === handle) chatHandle.current = null;
    };
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    void send(text);
  }

  const finished = status !== "collecting";
  const busy = pending || playing !== null;

  return (
    <div className="flex min-w-0 flex-col">
      <section
        ref={section}
        id="inquiry"
        data-story="chat"
        aria-label="Intake assistant"
        className="sheet flex h-[38rem] max-h-[86svh] min-h-0 scroll-mt-4 flex-col gap-4 p-5 sm:p-7 short:h-[33rem]"
      >
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">
            New client inquiry <span className="sr-only">with {firmName}</span>
          </h2>
          <p className="text-sm text-faint">About two minutes</p>
        </header>

        <div ref={log} role="log" aria-live="polite" className="-mx-2 flex-1 space-y-4 overflow-y-auto px-2 py-1">
          {messages.map((message, i) => {
            const visitor = message.role === "visitor";
            // A short question from the firm is the thing to answer next, so it is set large in the serif.
            const question = !visitor && message.text.length <= 80 && message.text.trimEnd().endsWith("?");
            return (
              // The client's own words sit to the right on a tinted slip; the firm's run down the left.
              <div key={i} className={`message-in ${visitor ? "ml-auto w-fit max-w-[86%] rounded-2xl rounded-br-md bg-mint px-4 py-2.5" : "max-w-[94%]"}`}>
                {message.guardrail && (
                  <p className={`tag mb-1.5 text-white ${message.guardrail === "safety" ? "bg-flag" : "bg-demo"}`}>{GUARDRAIL_NOTE[message.guardrail]}</p>
                )}
                <p
                  className={
                    visitor
                      ? "font-medium leading-[1.45] text-forest [overflow-wrap:anywhere]"
                      : question
                        ? "font-serif text-[1.625rem] leading-[1.2] tracking-[-0.01em]"
                        : "text-[1.0625rem] leading-normal"
                  }
                >
                  <span className="sr-only">{visitor ? "You: " : "The firm: "}</span>
                  {message.text}
                </p>
              </div>
            );
          })}
          {pending && (
            <div className="message-in">
              <p className="typing" role="status">
                <span className="sr-only">The assistant is replying</span>
                <i aria-hidden />
                <i aria-hidden />
                <i aria-hidden />
              </p>
            </div>
          )}
          {status === "complete" && leadId && (
            <div className="demo-note message-in p-4">
              <p className="font-semibold">This inquiry is now in the firm&apos;s pipeline.</p>
              <p className="mt-1 text-[0.9375rem] text-muted">It has been scored, and the messages the firm would send are in the outbox.</p>
              <Link href={`/staff/leads/${leadId}`} className="btn btn-primary btn-small mt-3">
                See it on the firm side
              </Link>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-flag-tint px-4 py-2 text-[0.9375rem] text-flag">
            {error}
          </p>
        )}

        {!finished && suggestions.length > 0 && !playing && (
          <div className="grid max-h-[13.5rem] grid-cols-2 gap-2 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => void send(suggestion)}
                className="min-h-11 cursor-pointer rounded-xl border border-line px-3.5 py-2 text-left font-medium leading-snug shadow-rest hover:border-forest disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {finished ? (
          <button type="button" onClick={restart} className="btn btn-quiet w-full">
            Start a new conversation
          </button>
        ) : (
          <form onSubmit={submit} className="flex items-center gap-2.5 rounded-full border border-edge py-1 pl-[1.125rem] pr-1 focus-within:border-fern">
            <label htmlFor="chat-input" className="sr-only">
              Your message
            </label>
            <input
              id="chat-input"
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              autoComplete="off"
              disabled={playing !== null}
              placeholder={playing === STORY ? "Playing the story" : playing ? "Playing a scripted conversation" : "Write your answer here"}
              className="field-line"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary btn-small shrink-0">
              Send
            </button>
          </form>
        )}

        <div className="flex items-start justify-between gap-4 text-[0.84375rem] leading-snug text-muted">
          <p>
            <strong className="font-semibold text-ink">Automated intake assistant. Not a lawyer.</strong> {disclaimer}
          </p>
          {!finished && (
            <button type="button" onClick={restart} className="link shrink-0 cursor-pointer">
              Start over
            </button>
          )}
        </div>
      </section>

      {/* The demo's own shortcuts, under the sheet so they never come between the visitor and the inquiry. */}
      <section aria-label="Demo scenarios" className="mt-5 rounded-[0.875rem] bg-white/85 px-3 py-2.5 text-center text-[0.875rem] leading-snug text-[#3a4441]">
        <h2>Short on time? Play a scripted conversation</h2>
        <div className="flex flex-wrap items-baseline justify-center gap-x-4">
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              title={scenario.blurb}
              onClick={() => void play(scenario)}
              disabled={playing !== null}
              aria-pressed={playing === scenario.key}
              className={`min-h-11 cursor-pointer font-semibold disabled:cursor-not-allowed lg:min-h-7 ${
                playing === scenario.key ? "text-ink underline underline-offset-[3px]" : "text-fern hover:underline hover:underline-offset-[3px] disabled:opacity-50"
              }`}
            >
              {scenario.title}
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-line pt-2 short:hidden">
          <p>
            <strong className="font-semibold">Try to fool it.</strong> Ask for legal advice and watch it decline
          </p>
          <div className="flex flex-wrap items-baseline justify-center gap-x-4">
            {adviceQuestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={busy || finished}
                onClick={() => void send(question)}
                className="min-h-11 cursor-pointer font-semibold text-fern hover:underline hover:underline-offset-[3px] disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-7"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
