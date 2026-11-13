"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/server/actions";

type Props = {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "quiet";
};

/** A button that runs one server action and shows the reason if the workflow refuses it. */
export function ActionButton({ action, children, pendingLabel, variant = "primary" }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <button type="button" onClick={onClick} disabled={pending} className={`btn ${variant === "primary" ? "btn-primary" : "btn-quiet"}`}>
        {pending ? pendingLabel : children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-flag">
          {error}
        </p>
      )}
    </div>
  );
}
