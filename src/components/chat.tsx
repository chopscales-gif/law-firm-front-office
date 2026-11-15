"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/db/schema";
import type { Scenario } from "@/lib/chat/scenarios";
import { endChatAction, sendChatAction, type ChatView } from "@/server/actions";
import { liveRefresh } from "./live-updates";
import { chatHandle, STORY_PACE } from "./story";

type Props = {
  /** Printed at the head of the sheet, as on the firm's letterhead. */
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

  const label = "text-xs font-semibold uppercase tracking-[0.14em]";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 short:gap-3">
      <section ref={section} data-story="chat" aria-label="Intake assistant" className="sheet scroll-mt-3 flex h-[44rem] max-h-[92svh] min-h-0 flex-col px-5 pb-5 pt-7 sm:px-12 sm:pt-10 lg:h-auto lg:max-h-none lg:flex-1 short:pt-6">
        <header className="border-b border-petrol pb-4 text-center short:pb-3">
          <h2 className="font-serif text-[1.375rem] leading-tight text-petrol [overflow-wrap:anywhere]">
            {firmName} <span className="sr-only">Start your inquiry</span>
          </h2>
          <p className={`${label} mt-1.5 text-muted`}>New client inquiry</p>
        </header>

        <div ref={log} role="log" aria-live="polite" className="-mx-2 flex-1 space-y-5 overflow-y-auto px-2 py-6 short:py-4">
          {messages.map((message, i) => (
            // The client's own words sit to the right on a tinted slip in plain type; the firm's run down the left in the letterhead's serif.
            <div key={i} className={`message-in ${message.role === "visitor" ? "ml-auto w-fit max-w-[86%] rounded-sm border-r-2 border-petrol bg-lake-tint px-4 py-2.5 text-right" : "max-w-[94%]"}`}>
              {message.guardrail && (
                <p className={`mb-1.5 w-fit rounded-sm px-2 py-0.5 text-[0.8125rem] font-semibold text-white ${message.guardrail === "safety" ? "bg-flag" : "bg-demo"}`}>
                  {GUARDRAIL_NOTE[message.guardrail]}
                </p>
              )}
              <p className={`${label} ${message.role === "visitor" ? "text-petrol" : "text-lake"}`}>{message.role === "visitor" ? "You" : "The firm"}</p>
              <p className={message.role === "visitor" ? "mt-0.5 text-left text-lg font-semibold leading-[1.45] text-petrol [overflow-wrap:anywhere]" : "mt-1 font-serif text-[1.1875rem] leading-[1.55]"}>{message.text}</p>
            </div>
          ))}
          {pending && (
            <div className="message-in">
              <p className={`${label} text-lake`}>The firm</p>
              <p className="typing mt-2.5" role="status">
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
              <Link href={`/staff/leads/${leadId}`} className="btn btn-primary mt-3">
                See it on the firm side
              </Link>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-3 bg-flag-tint px-4 py-2 text-[0.9375rem] text-flag">
            {error}
          </p>
        )}

        {!finished && suggestions.length > 0 && !playing && (
          <div className="flex flex-wrap gap-2 pb-4">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => void send(suggestion)}
                className="min-h-11 cursor-pointer rounded-sm border border-petrol/50 px-3.5 text-[0.9375rem] font-semibold text-petrol hover:border-petrol hover:bg-lake-tint disabled:opacity-50"
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
          <form onSubmit={submit} className="flex items-center gap-4 border-b-2 border-petrol focus-within:border-lake">
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
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-11 shrink-0 cursor-pointer text-[0.9375rem] font-semibold uppercase tracking-[0.08em] text-petrol hover:text-lake disabled:cursor-not-allowed disabled:opacity-55"
            >
              Send <span aria-hidden>&rarr;</span>
            </button>
          </form>
        )}

        <div className="mt-3 flex items-start justify-between gap-4 text-sm leading-snug text-muted">
          <p>
            <strong className="font-semibold text-petrol">Automated intake assistant. Not a lawyer.</strong> {disclaimer}
          </p>
          {!finished && (
            <button type="button" onClick={restart} className="link shrink-0 cursor-pointer">
              Start over
            </button>
          )}
        </div>
      </section>

      {/* The demo's own note, clipped under the sheet so it never comes between the visitor and the inquiry. */}
      <section aria-label="Demo scenarios" className="demo-note bg-transparent px-4 py-2.5 text-[0.9375rem] leading-snug">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Short on time? Play a scripted conversation:</h2>
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              title={scenario.blurb}
              onClick={() => void play(scenario)}
              disabled={playing !== null}
              aria-pressed={playing === scenario.key}
              className={`min-h-11 cursor-pointer font-semibold underline underline-offset-[3px] disabled:cursor-not-allowed lg:min-h-0 ${
                playing === scenario.key ? "text-ink decoration-ink" : "text-lake decoration-lake/50 hover:text-petrol disabled:opacity-50"
              }`}
            >
              {scenario.title}
            </button>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 short:hidden">
          <p>
            <strong className="font-semibold">Try to fool it.</strong> Ask for legal advice and watch it decline:
          </p>
          {adviceQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={busy || finished}
              onClick={() => void send(question)}
              className="min-h-11 cursor-pointer text-left font-semibold text-lake underline decoration-lake/50 underline-offset-[3px] hover:text-petrol disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-0"
            >
              {question}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
