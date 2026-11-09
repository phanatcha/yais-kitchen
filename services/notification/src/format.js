// Every class happens in Thailand, so emails show Thai time. Thailand has no
// daylight saving, so that is always UTC+7.
const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const inThailand = (time) =>
  new Date(new Date(time).getTime() + THAI_OFFSET_MS);

/** "Friday 20 November 2026" */
export function formatDate(time) {
  const date = inThailand(time);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "4:00 pm" */
export function formatTime(time) {
  const date = inThailand(time);
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
}

/** "Friday 20 November 2026, 4:00 pm to 5:30 pm (Thailand time)" */
export function formatClassTime(startsAt, endsAt) {
  return `${formatDate(startsAt)}, ${formatTime(startsAt)} to ${formatTime(endsAt)} (Thailand time)`;
}

/** Money is in satang, so 180000 is "THB 1,800". */
export function formatMoney({ amount }) {
  const digits = amount % 100 === 0 ? 0 : 2;
  return `THB ${(amount / 100).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** "Khao Soi (ข้าวซอย)", so the tourist can show it at a market. */
export function withThai(name, nameThai) {
  return nameThai ? `${name} (${nameThai})` : name;
}

/** "- Fresh egg noodles (บะหมี่ไข่): 200 g" */
export function ingredientLine({ name, nameThai, quantity }) {
  return `- ${withThai(name, nameThai)}: ${quantity}`;
}
