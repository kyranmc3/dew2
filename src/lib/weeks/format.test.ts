import assert from "node:assert/strict";
import { test } from "node:test";
import { backupTag, dayLabel, priceText, relativeWeek, shortDate, time12, timeText, todayInNewYork, weekLabel, weekRange } from "./format.ts";

test("dates", () => {
  assert.equal(weekLabel("2026-11-02"), "Week of Nov 2");
  assert.equal(weekRange("2026-11-30"), "Mon Nov 30 - Sun Dec 6");
  assert.equal(dayLabel("2026-11-03"), "Tuesday, Nov 3");
  assert.equal(shortDate("2026-11-03"), "Tue, Nov 3");
});

test("times", () => {
  assert.equal(time12("19:00:00"), "7:00 PM");
  assert.equal(time12("12:30:00"), "12:30 PM");
  assert.equal(time12("00:15:00"), "12:15 AM");
  assert.equal(time12(null), null);
  assert.equal(timeText({ start: "6:00 PM", end: "9:30 PM" }), "6:00–9:30 PM");
  assert.equal(timeText({ start: "11:00 AM", end: "1:00 PM" }), "11:00 AM–1:00 PM");
  assert.equal(timeText({ start: "7:30 PM", end: null }), "7:30 PM");
  assert.equal(timeText({ start: null, end: null }), "Time not listed");
});

test("prices and backup tags", () => {
  assert.equal(priceText(null), "Price not listed");
  assert.equal(priceText(0), "Free");
  assert.equal(priceText(24), "$24");
  assert.equal(priceText(41.32), "$41.32");
  assert.equal(backupTag({ price: 0 }), "Free");
  assert.equal(backupTag({ price: 19 }), "Under $20");
  assert.equal(backupTag({ price: 20 }), null);
  assert.equal(backupTag({ price: null }), null);
});

test("relative weeks", () => {
  assert.equal(relativeWeek("2026-11-02", "2026-11-01"), "This coming week");
  assert.equal(relativeWeek("2026-11-09", "2026-11-01"), "In 1 week");
  assert.equal(relativeWeek("2026-11-02", "2026-11-05"), "This week");
  assert.equal(relativeWeek("2026-11-02", "2026-11-09"), "Past");
});

test("today uses New York's date, not the server's", () => {
  assert.equal(todayInNewYork(new Date("2026-11-02T03:00:00Z")), "2026-11-01");
  assert.equal(todayInNewYork(new Date("2026-11-02T06:00:00Z")), "2026-11-02");
});
