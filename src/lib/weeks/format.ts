import type { WeekEvent } from "./types.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Dates here are plain calendar dates, so they're read in UTC to avoid shifting by time zone.
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const monthDay = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const shortDay = (d: Date) => DAYS[d.getUTCDay()].slice(0, 3);

export const shortDate = (iso: string) => `${shortDay(toDate(iso))}, ${monthDay(toDate(iso))}`;
export const dayLabel = (iso: string) => `${DAYS[toDate(iso).getUTCDay()]}, ${monthDay(toDate(iso))}`;
export const weekLabel = (monday: string) => `Week of ${monthDay(toDate(monday))}`;

export function weekRange(monday: string) {
  const start = toDate(monday);
  const end = new Date(start.getTime() + 6 * 86400000);
  return `${shortDay(start)} ${monthDay(start)} - ${shortDay(end)} ${monthDay(end)}`;
}

// "19:00:00" becomes "7:00 PM".
export function time12(value: string | null): string | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export const priceText = (price: number | null) =>
  price == null ? "Price not listed" : price === 0 ? "Free" : `$${Number.isInteger(price) ? price : price.toFixed(2)}`;

export function timeText(e: Pick<WeekEvent, "start" | "end">) {
  if (!e.start) return "Time not listed";
  if (!e.end) return e.start;
  const sameMeridiem = e.start.slice(-2) === e.end.slice(-2);
  return `${sameMeridiem ? e.start.slice(0, -3) : e.start}–${e.end}`;
}

export const backupTag = (e: Pick<WeekEvent, "price">) =>
  e.price === 0 ? "Free" : e.price != null && e.price < 20 ? "Under $20" : null;

export function relativeWeek(monday: string, today: string) {
  const days = Math.round((toDate(monday).getTime() - toDate(today).getTime()) / 86400000);
  if (days <= -7) return "Past";
  if (days <= 0) return "This week";
  if (days <= 7) return "This coming week";
  const weeks = Math.ceil(days / 7) - 1;
  return `In ${weeks} week${weeks === 1 ? "" : "s"}`;
}

// Today in New York, where the app's one user is, wherever the server runs.
export const todayInNewYork = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);

const DEFAULT_LENGTH = 2 * 3600000;

// Times are New York wall-clock times, and the link says so, so the device's time zone
// doesn't matter. UTC is only used here to do the date arithmetic.
export function googleCalendarUrl(e: Pick<WeekEvent, "name" | "date" | "startTime" | "endTime" | "place" | "link">) {
  const stamp = (d: Date, length: number) => d.toISOString().slice(0, length).replace(/[-:]/g, "");
  let dates: string;
  if (e.startTime) {
    const start = new Date(`${e.date}T${e.startTime}Z`);
    let end = e.endTime ? new Date(`${e.date}T${e.endTime}Z`) : start;
    // An end time earlier than the start is after midnight.
    if (end < start) end = new Date(end.getTime() + 86400000);
    if (end.getTime() === start.getTime()) end = new Date(start.getTime() + DEFAULT_LENGTH);
    dates = `${stamp(start, 19)}/${stamp(end, 19)}`;
  } else {
    // An all-day event ends on the following day.
    dates = `${stamp(toDate(e.date), 10)}/${stamp(new Date(toDate(e.date).getTime() + 86400000), 10)}`;
  }
  const details = [!e.startTime && "Time not listed", e.link].filter(Boolean).join("\n\n");
  const params = [
    ["text", e.name],
    ["location", e.place],
    ["details", details],
  ].filter(([, value]) => value);
  const query = params.map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${dates}&ctz=America/New_York${query}`;
}

export function checkedOn(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(new Date(iso));
}
