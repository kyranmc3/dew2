import { hasPassed, isDecided, isPast } from "./state.ts";
import type { WeekState } from "./types.ts";

// Weekdays are numbered as in getUTCDay, so 0 is Sunday.
export const DEFAULT_WEEKDAYS = [2, 3, 4];

const DAY = 86400000;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const sorted = (dates: string[]) => [...new Set(dates)].sort();

// Monday to Sunday of the week starting on this Monday.
export const weekDates = (monday: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(new Date(`${monday}T00:00:00Z`).getTime() + i * DAY).toISOString().slice(0, 10));

const fromSettings = (monday: string, weekdays: number[]) => weekDates(monday).filter((d) => weekdays.includes(weekday(d)));

// A week with a plan, or a skipped week, keeps the days it was settled with.
export const isSettled = (s: WeekState) => s.skipped || isDecided(s);

// The days a week shows for this user.
export function weekDays(monday: string, weekdays: number[], s: WeekState, today: string, answeredDates: string[]): string[] {
  if (isSettled(s) && s.days) return s.days;
  // A past week that was never settled shows the days something was answered on, so
  // later settings can't change it.
  if (isPast(monday, today) && !s.days && answeredDates.length) return sorted(answeredDates);
  // Days that have passed keep what they showed. The rest follow Settings.
  const settings = fromSettings(monday, weekdays);
  const before = s.days ?? settings;
  return sorted([...before.filter((d) => hasPassed(d, today)), ...settings.filter((d) => !hasPassed(d, today))]);
}

// A plan set on other days, while there's still time to reset it.
export function preferencesChanged(monday: string, weekdays: number[], s: WeekState, today: string) {
  if (!isDecided(s) || s.skipped || !s.days || isPast(monday, today)) return false;
  const upcoming = (dates: string[]) => dates.filter((d) => !hasPassed(d, today)).join();
  return upcoming(s.days) !== upcoming(fromSettings(monday, weekdays));
}

// Choices for the events on screen. The rest are hidden but kept.
export function restrict(s: WeekState, ids: Set<string>): WeekState {
  const keep = <T,>(entries: Record<string, T>) => Object.fromEntries(Object.entries(entries).filter(([id]) => ids.has(id)));
  return { ...s, answers: keep(s.answers), ranking: s.ranking.filter((id) => ids.has(id)), plan: keep(s.plan) };
}

// Puts changes made on screen back together with the hidden choices.
export function merge(full: WeekState, shown: WeekState, ids: Set<string>): WeekState {
  const hidden = <T,>(entries: Record<string, T>) => Object.fromEntries(Object.entries(entries).filter(([id]) => !ids.has(id)));
  return {
    ...shown,
    answers: { ...hidden(full.answers), ...shown.answers },
    ranking: [...shown.ranking, ...full.ranking.filter((id) => !ids.has(id))],
    plan: { ...hidden(full.plan), ...shown.plan },
  };
}

// Settling a week keeps the days on screen. Unsettling it keeps only the days that have
// passed, so the rest pick up Settings.
export function settleDays(before: WeekState, after: WeekState, shownDays: string[], today: string): WeekState {
  if (isSettled(after) && !isSettled(before)) return { ...after, days: shownDays };
  if (!isSettled(after) && isSettled(before)) {
    const kept = (before.days ?? shownDays).filter((d) => hasPassed(d, today));
    return { ...after, days: kept.length ? kept : null };
  }
  return after;
}

// Everything a screen needs for one week. A settled week also shows any day its plan
// moved to, so a commitment never disappears.
export function weekView<E extends { id: string; date: string }>(monday: string, events: E[], full: WeekState, weekdays: number[], today: string) {
  const answered = events.filter((e) => full.answers[e.id]).map((e) => e.date);
  const committed = isSettled(full) ? events.filter((e) => full.plan[e.id]).map((e) => e.date) : [];
  const days = sorted([...weekDays(monday, weekdays, full, today, answered), ...committed]);
  const shown = events.filter((e) => days.includes(e.date));
  const ids = new Set(shown.map((e) => e.id));
  return { days, events: shown, ids, state: restrict(full, ids), preferencesChanged: preferencesChanged(monday, weekdays, full, today) };
}
