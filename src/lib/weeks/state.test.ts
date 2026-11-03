import assert from "node:assert/strict";
import { test } from "node:test";
import { answerEvent, bookingLine, buildState, commitEvent, countable, diffStates, hasChoices, hasPassed, isDecided, isLocked, isPast, moveEvent, noChanges, planIds, resetWeek, setBooking, toReview, weekStatus } from "./state.ts";
import { EMPTY_STATE, type WeekState } from "./types.ts";

const state = (over: Partial<WeekState> = {}): WeekState => ({ ...EMPTY_STATE, ...over });

test("Yes adds to the end of the shortlist, and answering again clears it", () => {
  let s = answerEvent(state(), "a", "yes");
  s = answerEvent(s, "b", "yes");
  assert.deepEqual(s.ranking, ["a", "b"]);
  s = answerEvent(s, "a", "yes");
  assert.deepEqual(s.ranking, ["b"]);
  assert.equal(s.answers.a, undefined);
});

test("moving off Yes removes the rank and the commitment", () => {
  let s = commitEvent(answerEvent(state(), "a", "yes"), "a");
  s = answerEvent(s, "a", "no");
  assert.deepEqual(s.ranking, []);
  assert.deepEqual(s.plan, {});
  assert.equal(s.answers.a, "no");
});

test("moveEvent reorders and stops at the ends", () => {
  const s = state({ ranking: ["a", "b"] });
  assert.deepEqual(moveEvent(s, "b", -1).ranking, ["b", "a"]);
  assert.equal(moveEvent(s, "a", -1), s);
});

test("booking toggles, and a commitment starts not booked", () => {
  let s = commitEvent(state({ ranking: ["a"] }), "a");
  assert.equal(s.plan.a.booking, null);
  s = setBooking(s, "a", "booked");
  assert.equal(s.plan.a.booking, "booked");
  s = setBooking(s, "a", "waitlist");
  assert.equal(s.plan.a.booking, "waitlist");
  s = setBooking(s, "a", "waitlist");
  assert.equal(s.plan.a.booking, null);
});

test("the plan follows shortlist order", () => {
  const s = state({ ranking: ["c", "a", "b"], plan: { a: { booking: null }, c: { booking: null } } });
  assert.deepEqual(planIds(s), ["c", "a"]);
});

test("a saved week with nothing committed isn't decided", () => {
  assert.equal(isDecided(state({ saved: true })), false);
  assert.equal(isDecided(state({ saved: true, ranking: ["a"], plan: { a: { booking: null } } })), true);
  assert.equal(hasChoices(state()), false);
  assert.equal(hasChoices(state({ answers: { a: "no" } })), true);
});

test("bookingLine says the status or counts", () => {
  const one = (booking: "booked" | "waitlist" | null) => state({ ranking: ["a"], plan: { a: { booking } } });
  assert.equal(bookingLine(one(null)), "Not booked");
  assert.equal(bookingLine(one("booked")), "Booked");
  assert.equal(bookingLine(one("waitlist")), "Waitlist");
  const three = state({ ranking: ["a", "b", "c"], plan: { a: { booking: "waitlist" }, b: { booking: "booked" }, c: { booking: null } } });
  assert.equal(bookingLine(three), "1 booked, 1 not booked, 1 on waitlist");
});

test("buildState orders by rank and drops events no longer in the catalog", () => {
  const s = buildState(
    new Set(["a", "b"]),
    [
      { event_id: "a", answer: "yes", shortlist_rank: 2 },
      { event_id: "b", answer: "yes", shortlist_rank: 1 },
      { event_id: "gone", answer: "yes", shortlist_rank: 3 },
    ],
    [{ event_id: "gone", booking: null }, { event_id: "a", booking: "booked" }],
    { is_saved: true, is_skipped: false, days: ["2026-11-03"] },
  );
  assert.deepEqual(s.ranking, ["b", "a"]);
  assert.deepEqual(Object.keys(s.answers).sort(), ["a", "b"]);
  assert.deepEqual(s.plan, { a: { booking: "booked" } });
  assert.equal(s.saved, true);
  assert.deepEqual(s.days, ["2026-11-03"]);
});

test("buildState copes with no week row", () => {
  assert.deepEqual(buildState(new Set(), [], [], null), EMPTY_STATE);
});

test("diffStates writes only what changed", () => {
  const before = state({ answers: { a: "yes", b: "yes", c: "maybe" }, ranking: ["a", "b"], plan: { a: { booking: null } } });
  assert.equal(noChanges(diffStates(before, before)), true);

  const moved = diffStates(before, moveEvent(before, "b", -1));
  assert.deepEqual(moved.responseUpserts.map((r) => [r.event_id, r.shortlist_rank]), [["a", 2], ["b", 1]]);
  assert.deepEqual(moved.planUpserts, []);

  const booked = diffStates(before, setBooking(before, "a", "booked"));
  assert.deepEqual(booked.planUpserts, [{ event_id: "a", booking: "booked" }]);
  assert.deepEqual(booked.responseUpserts, []);

  const no = diffStates(before, answerEvent(before, "a", "no"));
  assert.deepEqual(no.planDeletes, ["a"]);
  assert.deepEqual(no.responseUpserts.map((r) => [r.event_id, r.answer, r.shortlist_rank]), [["a", "no", null], ["b", "yes", 1]]);

  const cleared = diffStates(before, answerEvent(before, "c", "maybe"));
  assert.deepEqual(cleared.responseDeletes, ["c"]);

  assert.deepEqual(diffStates(before, { ...before, saved: true }).week, { is_saved: true, is_skipped: false, days: null });
  assert.deepEqual(diffStates(before, { ...before, days: ["2026-11-03"] }).week, { is_saved: false, is_skipped: false, days: ["2026-11-03"] });
});

test("a full reset deletes every answer and commitment", () => {
  const before = state({ answers: { a: "yes", b: "no" }, ranking: ["a"], plan: { a: { booking: "booked" } }, saved: true });
  const c = diffStates(before, EMPTY_STATE);
  assert.deepEqual(c.planDeletes, ["a"]);
  assert.deepEqual(c.responseDeletes.sort(), ["a", "b"]);
  assert.deepEqual(c.week, { is_saved: false, is_skipped: false, days: null });
});

test("a week stays current through its Sunday and becomes past on the Monday after", () => {
  assert.equal(isPast("2026-11-02", "2026-11-07"), false);
  assert.equal(isPast("2026-11-02", "2026-11-08"), false);
  assert.equal(isPast("2026-11-02", "2026-11-09"), true);
});

test("a day passes once it's over, and today stays open", () => {
  assert.equal(hasPassed("2026-11-03", "2026-11-04"), true);
  assert.equal(hasPassed("2026-11-04", "2026-11-04"), false);
  assert.equal(hasPassed("2026-11-05", "2026-11-04"), false);
});

test("resetting a week keeps choices on days that have passed", () => {
  const events = [{ id: "tue", date: "2026-11-03" }, { id: "wed", date: "2026-11-04" }, { id: "thu", date: "2026-11-05" }];
  const before = state({
    answers: { tue: "yes", wed: "yes", thu: "no" },
    ranking: ["wed", "tue"],
    plan: { tue: { booking: "booked" }, wed: { booking: null } },
    saved: true,
  });
  assert.deepEqual(resetWeek(before, events, "2026-11-04"), state({ answers: { tue: "yes" }, ranking: ["tue"], plan: { tue: { booking: "booked" } } }));
  assert.deepEqual(resetWeek(before, events, "2026-11-02"), EMPTY_STATE);
  assert.deepEqual(resetWeek({ ...before, saved: false, skipped: true }, events, "2026-11-02"), EMPTY_STATE);
});

test("any booked commitment locks a week, and removing it reopens the week", () => {
  const waitlist = state({ ranking: ["a", "b"], plan: { a: { booking: "waitlist" }, b: { booking: null } } });
  assert.equal(isLocked(waitlist), false);
  const booked = setBooking(waitlist, "b", "booked");
  assert.equal(isLocked(booked), true);
  assert.equal(isLocked(setBooking(booked, "b", "booked")), false);
});

test("weekStatus takes the first state that applies", () => {
  const today = "2026-11-03";
  const start = "2026-11-02";
  const booked = state({ saved: true, ranking: ["a"], plan: { a: { booking: "booked" } } });
  const notBooked = state({ saved: true, ranking: ["a"], plan: { a: { booking: null } } });
  assert.equal(weekStatus(start, "2026-11-09", true, { ...booked, skipped: true }), "past");
  assert.equal(weekStatus(start, today, true, { ...booked, skipped: true }), "skipped");
  assert.equal(weekStatus(start, today, true, booked), "locked");
  assert.equal(weekStatus(start, today, true, notBooked), "decided");
  assert.equal(weekStatus(start, today, true, state()), "review");
  assert.equal(weekStatus(start, today, true, { ...notBooked, plan: {} }), "review");
  assert.equal(weekStatus(start, today, false, state()), "notReady");
});

test("toReview finds unanswered events that are still listed and still open", () => {
  const events = [
    { id: "a", date: "2026-11-04", removed: false },
    { id: "b", date: "2026-11-04", removed: false },
    { id: "c", date: "2026-11-04", removed: true },
    { id: "d", date: "2026-11-03", removed: false },
  ];
  assert.deepEqual(toReview(events, state({ answers: { a: "no" } }), "2026-11-04").map((e) => e.id), ["b"]);
  assert.deepEqual(toReview(events, state({ answers: { a: "no" } }), "2026-11-02").map((e) => e.id), ["b", "d"]);
});

test("progress counts answered events and open ones, not unanswered passed ones", () => {
  const events = [{ id: "a", date: "2026-11-03" }, { id: "b", date: "2026-11-03" }, { id: "c", date: "2026-11-04" }];
  assert.deepEqual(countable(events, state({ answers: { a: "yes" } }), "2026-11-04").map((e) => e.id), ["a", "c"]);
});
