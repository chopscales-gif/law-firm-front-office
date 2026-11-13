"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/db/schema";
import type { Scenario } from "@/lib/chat/scenarios";
import { sendChatAction } from "@/server/actions";

type Props = {
  opening: ChatMessage[];
  openingSuggestions: string[];
  disclaimer: string;
  scenarios: Scenario[];
};

const GUARDRAIL_NOTE = {
  advice: "Guardrail: declined to give legal advice",
  safety: "Guardrail: safety concern flagged for staff",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Chat({ opening, openingSuggestions, disclaimer, scenarios }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(opening);
  const [suggestions, setSuggestions] = useState<string[]>(openingSuggestions);
  const [status, setStatus] = useState<"collecting" | "complete" | "outside">("collecting");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Refs hold what a scripted scenario needs between awaits, where state would be stale.
  const sessionId = useRef<string | null>(null);
  const run = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function restart() {
    run.current += 1;
    sessionId.current = null;
    setMessages(opening);
    setSuggestions(openingSuggestions);
    setStatus("collecting");
    setLeadId(null);
    setError(null);
    setPlaying(null);
    setPending(false);
  }

  /** Sends one message. Returns false if it failed or the conversation was restarted meanwhile. */
  async function send(text: string, token = run.current): Promise<boolean> {
    setError(null);
    setPending(true);
    setSuggestions([]);
    setMessages((all) => [...all, { role: "visitor", text }]);
    const result = await sendChatAction(sessionId.current, text);
    if (token !== run.current) return false;
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    sessionId.current = result.view.sessionId;
    setMessages((all) => [...all, ...result.view.added.filter((m) => m.role === "assistant")]);
    setSuggestions(result.view.suggestions);
    setStatus(result.view.status);
    setLeadId(result.view.leadId);
    return true;
  }

  async function play(scenario: Scenario) {
    restart();
    const token = run.current;
    setPlaying(scenario.key);
    for (const message of scenario.messages) {
      await wait(650);
      if (token !== run.current) return;
      if (!(await send(message, token))) break;
    }
    if (token === run.current) setPlaying(null);
  }

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
    <div className="flex flex-col gap-3">
      <section aria-label="Demo scenarios" className="demo-chrome rounded-lg bg-ink p-4 text-white">
        <h2 className="text-sm font-semibold">Short on time? Play a scripted conversation</h2>
        <p className="mt-1 text-sm text-white/70">Each one runs through the real chat below. Then open Firm side to see what the firm receives.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              onClick={() => void play(scenario)}
              disabled={playing !== null}
              aria-pressed={playing === scenario.key}
              className={`cursor-pointer rounded-md border p-3 text-left disabled:cursor-not-allowed ${
                playing === scenario.key ? "border-white bg-white/15" : "border-white/25 hover:border-white disabled:opacity-50"
              }`}
            >
              <span className="block text-sm font-semibold">{scenario.title}</span>
              <span className="mt-1 block text-[0.8125rem] leading-snug text-white/70">{scenario.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Intake assistant" className="panel flex h-[34rem] max-h-[80svh] flex-col overflow-hidden shadow-[0_12px_32px_-18px_rgba(22,32,43,0.45)]">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-juniper px-4 py-3 text-white">
          <div>
            <h2 className="font-serif text-lg leading-tight">Start your inquiry</h2>
            <p className="text-[0.8125rem] text-white/80">Automated intake assistant. Not a lawyer.</p>
          </div>
          <button type="button" onClick={restart} className="cursor-pointer rounded border border-white/40 px-2.5 py-1 text-[0.8125rem] font-semibold hover:border-white">
            Start over
          </button>
        </header>

        <div ref={log} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message, i) => (
            <div key={i} className={`message-in flex flex-col ${message.role === "visitor" ? "items-end" : "items-start"}`}>
              {message.guardrail && (
                <span className="mb-1 rounded bg-ink px-2 py-0.5 text-xs font-semibold text-white">{GUARDRAIL_NOTE[message.guardrail]}</span>
              )}
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-relaxed ${
                  message.role === "visitor" ? "rounded-br-sm bg-juniper text-white" : "rounded-bl-sm bg-paper text-ink"
                }`}
              >
                {message.text}
              </p>
            </div>
          ))}
          {pending && <p className="text-sm text-muted">The assistant is replying</p>}
          {status === "complete" && leadId && (
            <div className="demo-chrome message-in rounded-lg bg-ink p-4 text-white">
              <p className="text-sm font-semibold">This inquiry is now in the firm&apos;s pipeline.</p>
              <p className="mt-1 text-sm text-white/75">It has been scored, and the confirmation email and reminder text are in the outbox.</p>
              <Link href={`/staff/leads/${leadId}`} className="btn mt-3 bg-white text-ink hover:bg-white/90">
                See it on the firm side
              </Link>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="border-t border-flag/30 bg-flag-tint px-4 py-2 text-sm text-flag">
            {error}
          </p>
        )}

        {!finished && suggestions.length > 0 && !playing && (
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={busy}
                onClick={() => void send(suggestion)}
                className="cursor-pointer rounded-full border border-juniper/40 bg-juniper-tint px-3 py-1.5 text-sm font-medium text-juniper-deep hover:border-juniper disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {finished ? (
          <div className="border-t border-line px-4 py-3">
            <button type="button" onClick={restart} className="btn btn-quiet w-full">
              Start a new conversation
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex gap-2 border-t border-line px-4 py-3">
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
              placeholder={playing ? "Playing a scripted conversation" : "Type your answer"}
              className="field"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="btn btn-primary">
              Send
            </button>
          </form>
        )}
        <p className="border-t border-line bg-paper px-4 py-2 text-xs leading-snug text-muted">{disclaimer}</p>
      </section>
    </div>
  );
}
