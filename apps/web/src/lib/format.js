const thb = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "THB",
  trailingZeroDisplay: "stripIfInteger",
});

/** 80000 satang → "THB 800" */
export function formatTHB(satang) {
  return thb.format(satang / 100);
}

/**
 * Shows a UTC time in the visitor's time zone, with Thailand time beside it (FR-07).
 * @param {string} iso e.g. "2026-12-01T03:00:00Z"
 */
export function formatClassTime(iso) {
  const date = new Date(iso);
  const local = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  const thailand = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
  return { local, thailand: `${thailand} Thailand time` };
}
