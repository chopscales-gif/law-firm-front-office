import type { Subject } from "./check";

/**
 * Names offered on the conflict search screen under "Try to fool it". Each of
 * the first four is written differently from the name on file and is still
 * found. The last is a different person whose name only looks similar, and the
 * search correctly finds nothing. A test runs every one against the sample data.
 */
export type SearchExample = { name: string; role: Subject["role"]; shows: string; found: boolean };

export const SEARCH_EXAMPLES: SearchExample[] = [
  { name: "Bill Thornton", role: "prospect", shows: "A nickname. On file as William.", found: true },
  { name: "Sara Timczak", role: "adverse", shows: "A misspelling, in both names.", found: true },
  { name: "Kate Reyes", role: "adverse", shows: "A former name, and a nickname as well.", found: true },
  { name: "WRPM", role: "prospect", shows: "A company written as its initials.", found: true },
  { name: "Sarah Thompson", role: "adverse", shows: "A different person. It should find nothing.", found: false },
];
