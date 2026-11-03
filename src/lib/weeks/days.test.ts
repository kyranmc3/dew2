import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_WEEKDAYS, merge, preferencesChanged, restrict, settleDays, weekDates, weekDays, weekView } from "./days.ts";
import { EMPTY_STATE, type WeekState } from "./types.ts";

const state = (over: Partial<WeekState> = {}): WeekState => ({ ...EMPTY_STATE, ...over });
const MON = "2026-12-07";
const TUE_THU = ["2026-12-08", "2026-12-09", "2026-12-10"];
const WED_FRI = ["2026-12-09", "2026-12-10", "2026-12-11"];
const WED_THU_FRI = [3, 4, 5];
const decided = state({ answers: { a: "yes" }, ranking: ["a"], plan: { a: { booking: null } }, saved: true, days: TUE_THU });

test("weekDates runs Monday to Sunday", () => {
  assert.deepEqual(weekDates("2026-11-30"), ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
});

test("an unsettled week follows Settings", () => {
  assert.deepEqual(weekDays(MON, DEFAULT_WEEKDAYS, state(), "2026-11-02", []), TUE_THU);
  assert.deepEqual(weekDays(MON, WED_THU_FRI, state(), "2026-11-02", []), WED_FRI);
  assert.deepEqual(weekDays(MON, [0, 1], state(), "2026-11-02", []), ["2026-12-07", "2026-12-13"]);
});

test("a settled week keeps its days", () => {
  assert.deepEqual(weekDays(MON, WED_THU_FRI, decided, "2026-11-02", []), TUE_THU);
  assert.deepEqual(weekDays(MON, WED_THU_FRI, state({ skipped: true, days: TUE_THU }), "2026-11-02", []), TUE_THU);
});

test("a saved week with no commitments left follows Settings", () => {
  assert.deepEqual(weekDays(MON, WED_THU_FRI, { ...decided, plan: {} }, "2026-11-02", []), WED_FRI);
});

test("days that have passed keep what they showed", () => {
  // Wednesday, with Tuesday kept from before Settings changed.
  assert.deepEqual(weekDays(MON, [4, 5], state({ days: TUE_THU }), "2026-12-09", []), ["2026-12-08", "2026-12-10", "2026-12-11"]);
  // With nothing kept, passed days come from Settings.
  assert.deepEqual(weekDays(MON, WED_THU_FRI, state(), "2026-12-10", []), WED_FRI);
});

test("a past week that was never settled shows the days something was answered on", () => {
  assert.deepEqual(weekDays(MON, WED_THU_FRI, state(), "2026-12-14", ["2026-12-08", "2026-12-08"]), ["2026-12-08"]);
  assert.deepEqual(weekDays(MON, WED_THU_FRI, state(), "2026-12-14", []), WED_FRI);
});

test("the preferences message shows when a plan's upcoming days differ from Settings", () => {
  assert.equal(preferencesChanged(MON, DEFAULT_WEEKDAYS, decided, "2026-11-02"), false);
  assert.equal(preferencesChanged(MON, WED_THU_FRI, decided, "2026-11-02"), true);
  // During the week too, but only for days still to come.
  assert.equal(preferencesChanged(MON, WED_THU_FRI, decided, "2026-12-09"), true);
  assert.equal(preferencesChanged(MON, [3, 4], decided, "2026-12-09"), false);
  // Not once the week is past, not on a skipped week, and not without a plan.
  assert.equal(preferencesChanged(MON, WED_THU_FRI, decided, "2026-12-14"), false);
  assert.equal(preferencesChanged(MON, WED_THU_FRI, state({ skipped: true, days: TUE_THU }), "2026-11-02"), false);
  assert.equal(preferencesChanged(MON, WED_THU_FRI, { ...decided, plan: {} }, "2026-11-02"), false);
});

test("restrict hides choices off screen, and merge puts them back", () => {
  const full = state({ answers: { a: "yes", b: "yes", c: "no" }, ranking: ["b", "a"], plan: { b: { booking: "booked" } } });
  const ids = new Set(["a", "c"]);
  const shown = restrict(full, ids);
  assert.deepEqual(shown, state({ answers: { a: "yes", c: "no" }, ranking: ["a"], plan: {} }));
  const changed: WeekState = { ...shown, answers: { a: "yes" }, plan: { a: { booking: null } } };
  assert.deepEqual(merge(full, changed, ids), state({ answers: { b: "yes", a: "yes" }, ranking: ["a", "b"], plan: { b: { booking: "booked" }, a: { booking: null } } }));
});

test("settling keeps the days on screen, and unsettling keeps only passed days", () => {
  const review = state({ answers: { a: "yes" }, ranking: ["a"], plan: { a: { booking: null } } });
  assert.deepEqual(settleDays(review, { ...review, saved: true }, WED_FRI, "2026-11-02").days, WED_FRI);
  assert.deepEqual(settleDays(review, { ...review, skipped: true }, WED_FRI, "2026-11-02").days, WED_FRI);
  assert.equal(settleDays(decided, { ...decided, saved: false }, TUE_THU, "2026-11-02").days, null);
  assert.deepEqual(settleDays(decided, { ...decided, plan: {} }, TUE_THU, "2026-12-09").days, ["2026-12-08"]);
  assert.deepEqual(settleDays(decided, { ...decided, answers: {} }, TUE_THU, "2026-11-02"), { ...decided, answers: {} });
});

test("weekView shows the week's days and keeps a moved commitment on screen", () => {
  const events = [
    { id: "a", date: "2026-12-11" },
    { id: "b", date: "2026-12-08" },
    { id: "c", date: "2026-12-12" },
  ];
  const view = weekView(MON, events, decided, WED_THU_FRI, "2026-11-02");
  assert.deepEqual(view.days, [...TUE_THU, "2026-12-11"]);
  assert.deepEqual(view.events.map((e) => e.id), ["a", "b"]);
  assert.equal(view.preferencesChanged, true);
  const open = weekView(MON, events, state({ answers: { b: "yes" }, ranking: ["b"] }), WED_THU_FRI, "2026-11-02");
  assert.deepEqual(open.events.map((e) => e.id), ["a"]);
  assert.deepEqual(open.state.answers, {});
});
