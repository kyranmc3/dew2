import type { Answer, Booking, WeekState } from "./types.ts";

// Answering Yes adds to the end of the shortlist. Anything else takes it off, along
// with any commitment. Answering the same way again clears it.
export function answerEvent(s: WeekState, id: string, value: Answer): WeekState {
  const next = s.answers[id] === value ? null : value;
  const answers = { ...s.answers };
  if (next) answers[id] = next;
  else delete answers[id];
  let { ranking, plan } = s;
  if (next === "yes") {
    if (!ranking.includes(id)) ranking = [...ranking, id];
  } else {
    ranking = ranking.filter((r) => r !== id);
    if (plan[id]) {
      plan = { ...plan };
      delete plan[id];
    }
  }
  return { ...s, answers, ranking, plan };
}

export function moveEvent(s: WeekState, id: string, delta: number): WeekState {
  const from = s.ranking.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= s.ranking.length) return s;
  const ranking = [...s.ranking];
  ranking.splice(to, 0, ranking.splice(from, 1)[0]);
  return { ...s, ranking };
}

export function commitEvent(s: WeekState, id: string): WeekState {
  const plan = { ...s.plan };
  if (plan[id]) delete plan[id];
  else plan[id] = { booking: null };
  return { ...s, plan };
}

export const setBooking = (s: WeekState, id: string, value: Exclude<Booking, null>): WeekState => ({
  ...s,
  plan: { ...s.plan, [id]: { booking: s.plan[id]?.booking === value ? null : value } },
});

export const canSave = (s: WeekState) => Object.keys(s.plan).length > 0;
export const planIds = (s: WeekState) => s.ranking.filter((id) => s.plan[id]);

// A saved week whose commitments were all undone goes back to being a review.
export const isDecided = (s: WeekState) => s.saved && planIds(s).length > 0;
export const hasChoices = (s: WeekState) => s.saved || Object.keys(s.answers).length > 0;

export function bookingLine(s: WeekState) {
  const list = planIds(s).map((id) => s.plan[id].booking);
  if (list.length === 1) return list[0] === "booked" ? "Booked" : list[0] === "waitlist" ? "Waitlist" : "Not booked";
  const count = (value: Booking) => list.filter((b) => b === value).length;
  return [
    count("booked") && `${count("booked")} booked`,
    count(null) && `${count(null)} not booked`,
    count("waitlist") && `${count("waitlist")} on waitlist`,
  ]
    .filter(Boolean)
    .join(", ");
}

// A week is locked once something is booked, which stops prompts about new events.
export const isLocked = (s: WeekState) => planIds(s).some((id) => s.plan[id].booking === "booked");

export function isPast(monday: string, today: string) {
  const sunday = new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * 86400000).toISOString().slice(0, 10);
  // The week rolls over on Sunday morning.
  return today >= sunday;
}

export type WeekStatus = "past" | "skipped" | "locked" | "decided" | "review" | "notReady";

// The first that applies wins.
export function weekStatus(monday: string, today: string, hasEvents: boolean, s: WeekState): WeekStatus {
  if (isPast(monday, today)) return "past";
  if (s.skipped) return "skipped";
  if (isLocked(s)) return "locked";
  if (isDecided(s)) return "decided";
  return hasEvents ? "review" : "notReady";
}

// Events waiting for an answer. Only a Decided week prompts about these.
export const toReview = <E extends { id: string; removed: boolean }>(events: E[], s: WeekState) =>
  events.filter((e) => !e.removed && !s.answers[e.id]);

export type ResponseRow = { event_id: string; answer: Answer; shortlist_rank: number | null };
export type PlanRow = { event_id: string; booking: Booking };
export type WeekStateRow = { is_saved: boolean; is_skipped: boolean };

// Events no longer in the catalog are left out, so they can't reach the screen.
export function buildState(eventIds: Set<string>, responses: ResponseRow[], plan: PlanRow[], week: WeekStateRow | null | undefined): WeekState {
  const visible = responses.filter((r) => eventIds.has(r.event_id));
  return {
    answers: Object.fromEntries(visible.map((r) => [r.event_id, r.answer])),
    ranking: visible
      .filter((r) => r.answer === "yes" && r.shortlist_rank != null)
      .sort((a, b) => a.shortlist_rank! - b.shortlist_rank!)
      .map((r) => r.event_id),
    plan: Object.fromEntries(plan.filter((p) => eventIds.has(p.event_id)).map((p) => [p.event_id, { booking: p.booking }])),
    saved: week?.is_saved ?? false,
    skipped: week?.is_skipped ?? false,
  };
}

export type StateChanges = {
  planDeletes: string[];
  responseDeletes: string[];
  responseUpserts: ResponseRow[];
  planUpserts: PlanRow[];
  week: WeekStateRow | null;
};

// What has to be written to take the database from one state to another.
export function diffStates(before: WeekState, after: WeekState): StateChanges {
  const rank = (s: WeekState, id: string) => {
    const index = s.ranking.indexOf(id);
    return index < 0 ? null : index + 1;
  };
  return {
    planDeletes: Object.keys(before.plan).filter((id) => !after.plan[id]),
    responseDeletes: Object.keys(before.answers).filter((id) => !after.answers[id]),
    responseUpserts: Object.keys(after.answers)
      .filter((id) => after.answers[id] !== before.answers[id] || rank(after, id) !== rank(before, id))
      .map((id) => ({ event_id: id, answer: after.answers[id], shortlist_rank: rank(after, id) })),
    planUpserts: Object.keys(after.plan)
      .filter((id) => !before.plan[id] || before.plan[id].booking !== after.plan[id].booking)
      .map((id) => ({ event_id: id, booking: after.plan[id].booking })),
    week: before.saved !== after.saved || before.skipped !== after.skipped ? { is_saved: after.saved, is_skipped: after.skipped } : null,
  };
}

export const noChanges = (c: StateChanges) =>
  !c.planDeletes.length && !c.responseDeletes.length && !c.responseUpserts.length && !c.planUpserts.length && !c.week;
