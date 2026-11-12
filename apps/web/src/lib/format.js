const thb = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "THB",
  trailingZeroDisplay: "stripIfInteger",
});

const BANGKOK = "Asia/Bangkok";

/** 80000 satang → "THB 800" */
export function formatTHB(satang) {
  return thb.format(satang / 100);
}

/**
 * Shows a UTC time in the visitor's time zone, with Thailand time beside it (FR-07).
 * @param {string} iso e.g. "2026-12-01T03:00:00Z"
 * @returns {{ local: string, thailand: string }}
 *   e.g. { local: "Tue 1 Dec, 04:00 CET", thailand: "Tue 1 Dec, 10:00 Thailand time" }
 */
export function formatClassTime(iso) {
  const date = new Date(iso);
  const parts = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };
  const local = new Intl.DateTimeFormat("en-GB", {
    ...parts,
    timeZoneName: "short",
  }).format(date);
  const thailand = new Intl.DateTimeFormat("en-GB", {
    ...parts,
    timeZone: BANGKOK,
  }).format(date);
  return { local, thailand: `${thailand} Thailand time` };
}

/** "2026-11-20T09:00:00Z" → "16:00" (Thailand time) */
export function formatThaiTime(iso) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BANGKOK,
  }).format(new Date(iso));
}

/** "2026-11-20T09:00:00Z" → "2026-11-20", the day in Thailand. */
export function thaiDateKey(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK }).format(
    new Date(iso),
  );
}

/** "2026-11-20" → "Fri 20 November" */
export function formatDayKey(dateKey, { month = "long" } = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month,
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

/** "2026-11" → "November 2026" */
export function formatMonthKey(monthKey) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

/** "2026-11-09" → "9 Nov 2026" (dates without a time, like payout periods) */
export function formatDate(dateKey) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateKey.slice(0, 10)}T00:00:00Z`));
}
