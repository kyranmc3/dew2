import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_WEEKDAYS, weekDates, weekView } from "./days.ts";
import { time12 } from "./format.ts";
import { buildState, diffStates, noChanges, type PlanRow, type ResponseRow, type WeekStateRow } from "./state.ts";
import type { WeekEvent, WeekInfo, WeekState } from "./types.ts";

const check = <T,>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
};

type EventRow = {
  id: string;
  name: string;
  source: string | null;
  type: string | null;
  format: string | null;
  featuring: string | null;
  venue: string | null;
  neighborhood: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  price: number | null;
  availability: string | null;
  link: string | null;
  description: string | null;
  poster_path: string | null;
  is_active: boolean;
  notion_edited_at: string | null;
};

const posterUrl = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/posters/${path}` : null;

const toEvent = (e: EventRow): WeekEvent => ({
  id: e.id,
  date: e.event_date,
  name: e.name,
  source: e.source,
  type: e.type,
  format: e.format,
  place: [e.venue, e.neighborhood].filter(Boolean).join(", "),
  start: time12(e.start_time),
  end: time12(e.end_time),
  startTime: e.start_time,
  endTime: e.end_time,
  price: e.price,
  avail: e.availability,
  img: posterUrl(e.poster_path),
  link: e.link,
  desc: e.description,
  removed: !e.is_active,
  checkedAt: e.notion_edited_at,
});

const toWeek = (w: { start_date: string; days: string[]; is_ready: boolean; day_notes: Record<string, string> }): WeekInfo => ({
  start: w.start_date,
  days: w.days,
  isReady: w.is_ready,
  dayNotes: w.day_notes,
});

export async function loadWeeks(supabase: SupabaseClient): Promise<WeekInfo[]> {
  return check(await supabase.from("weeks").select("start_date, days, is_ready, day_notes").order("start_date")).map(toWeek);
}

export async function loadWeek(supabase: SupabaseClient, start: string): Promise<WeekInfo | null> {
  const row = check(await supabase.from("weeks").select("start_date, days, is_ready, day_notes").eq("start_date", start).maybeSingle());
  return row ? toWeek(row) : null;
}

// In date and start-time order, with unknown times last. Includes removed events.
export async function loadEvents(supabase: SupabaseClient, first: string, last: string): Promise<WeekEvent[]> {
  const rows: EventRow[] = check(
    await supabase
      .from("events")
      .select("id, name, source, type, format, featuring, venue, neighborhood, event_date, start_time, end_time, price, availability, link, description, poster_path, is_active, notion_edited_at")
      .gte("event_date", first)
      .lte("event_date", last)
      .order("event_date")
      .order("start_time", { nullsFirst: false }),
  );
  return rows.map(toEvent);
}

// A removed event stays visible only while the user is committed to it.
export const visibleEvents = (events: WeekEvent[], plan: { event_id: string }[]) => {
  const committed = new Set(plan.map((p) => p.event_id));
  return events.filter((e) => !e.removed || committed.has(e.id));
};

export async function loadSources(supabase: SupabaseClient): Promise<string[]> {
  const rows: { source: string | null }[] = check(await supabase.from("events").select("source").eq("is_active", true));
  return [...new Set(rows.map((r) => r.source).filter((s): s is string => !!s))].sort();
}

// The weekdays this user plans around. Row-level security limits it to the user.
export async function loadWeekdays(supabase: SupabaseClient): Promise<number[]> {
  const row = check<{ weekdays: number[] } | null>(await supabase.from("user_settings").select("weekdays").maybeSingle());
  return row?.weekdays ?? DEFAULT_WEEKDAYS;
}

export async function loadWeekState(supabase: SupabaseClient, weekStart: string, eventIds: string[]): Promise<WeekState> {
  const [responses, plan, week] = await Promise.all([
    supabase.from("responses").select("event_id, answer, shortlist_rank").in("event_id", eventIds),
    supabase.from("plan_entries").select("event_id, booking").in("event_id", eventIds),
    supabase.from("week_states").select("is_saved, is_skipped, days").eq("week_start", weekStart).maybeSingle(),
  ]);
  return buildState(new Set(eventIds), check<ResponseRow[]>(responses), check<PlanRow[]>(plan), check<WeekStateRow | null>(week));
}

// Every week with the events and choices on the days the user sees, for the home, past
// weeks and settings pages. Row-level security limits the choices to the user. `full`
// also holds choices on days that are hidden.
export async function loadWeekSummaries(supabase: SupabaseClient, today: string) {
  const weeks = check<{ start_date: string; days: string[]; is_ready: boolean; day_notes: Record<string, string> }[]>(
    await supabase.from("weeks").select("start_date, days, is_ready, day_notes").order("start_date"),
  ).map(toWeek);
  const [responses, plan, states, weekdays] = await Promise.all([
    supabase.from("responses").select("event_id, answer, shortlist_rank"),
    supabase.from("plan_entries").select("event_id, booking"),
    supabase.from("week_states").select("week_start, is_saved, is_skipped, days"),
    loadWeekdays(supabase),
  ]);
  const planRows = check<PlanRow[]>(plan);
  const responseRows = check<ResponseRow[]>(responses);
  const stateRows = check<(WeekStateRow & { week_start: string })[]>(states);
  const events = weeks.length ? visibleEvents(await loadEvents(supabase, weeks[0].start, weekDates(weeks.at(-1)!.start)[6]), planRows) : [];
  return weeks.map((week) => {
    const dates = weekDates(week.start);
    const weekEvents = events.filter((e) => dates.includes(e.date));
    const full = buildState(new Set(weekEvents.map((e) => e.id)), responseRows, planRows, stateRows.find((s) => s.week_start === week.start));
    const view = weekView(week.start, weekEvents, full, weekdays, today);
    return { week: { ...week, days: view.days }, events: view.events, state: view.state, full };
  });
}

// Writes the difference between two states. Commitments are removed before their
// answers and added after them, because a commitment needs its answer to exist.
export async function saveChanges(supabase: SupabaseClient, userId: string, weekStart: string, before: WeekState, after: WeekState) {
  const c = diffStates(before, after);
  if (noChanges(c)) return;
  const withUser = <T extends object>(rows: T[]) => rows.map((row) => ({ ...row, user_id: userId }));
  if (c.planDeletes.length) check(await supabase.from("plan_entries").delete().eq("user_id", userId).in("event_id", c.planDeletes));
  if (c.responseDeletes.length) check(await supabase.from("responses").delete().eq("user_id", userId).in("event_id", c.responseDeletes));
  if (c.responseUpserts.length) check(await supabase.from("responses").upsert(withUser(c.responseUpserts)));
  if (c.planUpserts.length) check(await supabase.from("plan_entries").upsert(withUser(c.planUpserts)));
  if (c.week) check(await supabase.from("week_states").upsert({ user_id: userId, week_start: weekStart, ...c.week }));
}
