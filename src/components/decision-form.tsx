"use client";

import { useState, useTransition } from "react";
import { decideAction } from "@/server/actions";
import type { Decision } from "@/server/workflow";

/** The attorney's call after reading the conflict check. The software never makes this decision. */
export function DecisionForm({ leadId, noteRequiredToClear }: { leadId: string; noteRequiredToClear: boolean }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(decision: Decision) {
    setError(null);
    startTransition(async () => {
      const result = await decideAction(leadId, decision, note);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="max-w-[40rem]">
      <label htmlFor="decision-note" className="block font-semibold">
        Note for the file
      </label>
      <p className="mt-0.5 text-[0.9375rem] text-muted">
        {noteRequiredToClear
          ? "Required. The check found something, so say why it is safe to proceed, or why not."
          : "Optional when clearing. Required if you hold or decline."}
      </p>
      <textarea
        id="decision-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        maxLength={1000}
        className="field mt-2"
        placeholder="For example: different person, confirmed by date of birth."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => choose("cleared")} className="btn btn-primary">
          Clear to proceed
        </button>
        <button type="button" disabled={pending} onClick={() => choose("flagged")} className="btn btn-quiet">
          Hold for attorney review
        </button>
        <button type="button" disabled={pending} onClick={() => choose("declined")} className="btn btn-danger">
          Decline
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 font-semibold text-flag">
          {error}
        </p>
      )}
    </div>
  );
}
