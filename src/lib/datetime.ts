// Centralized 12-hour AM/PM datetime helpers (en-US)

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  month: "short", day: "numeric", year: "numeric",
};
const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
};
const TIME_SHORT_OPTS: Intl.DateTimeFormatOptions = {
  hour: "numeric", minute: "2-digit", hour12: true,
};

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-US", DATE_OPTS) : "—";
}

export function fmtTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString("en-US", TIME_OPTS) : "—";
}

export function fmtTimeShort(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString("en-US", TIME_SHORT_OPTS) : "—";
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.toLocaleDateString("en-US", DATE_OPTS)} · ${d.toLocaleTimeString("en-US", TIME_OPTS)}`;
}

export function fmtDateTimeShort(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.toLocaleDateString("en-US", DATE_OPTS)} · ${d.toLocaleTimeString("en-US", TIME_SHORT_OPTS)}`;
}

export function fmtWeekdayDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

export function fmtHours(hours: number | null | undefined): string {
  if (hours == null || isNaN(Number(hours))) return "—";
  const h = Number(hours);
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${mins.toString().padStart(2, "0")}m`;
}
