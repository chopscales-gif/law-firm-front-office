/** Dates are always shown in the firm's time zone, wherever the server or the visitor happens to be. */
const ZONE = "America/Denver";

export function fmtDate(at: Date): string {
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: ZONE });
}

export function fmtDateTime(at: Date): string {
  return at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE });
}

export function timeAgo(at: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
