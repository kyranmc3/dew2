import assert from "node:assert/strict";
import { test } from "node:test";
import { backupTag, dayLabel, googleCalendarUrl, priceText, relativeWeek, shortDate, time12, timeText, todayInNewYork, weekLabel, weekRange } from "./format.ts";

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

test("Google Calendar links", () => {
  const event = { name: "A Show", date: "2026-11-03", startTime: "19:00:00", endTime: "21:30:00", place: "The Venue, Bushwick", link: "https://example.com/show" };
  const calendar = (changes = {}) => new URL(googleCalendarUrl({ ...event, ...changes })).searchParams;

  const full = calendar();
  assert.equal(full.get("action"), "TEMPLATE");
  assert.equal(full.get("text"), "A Show");
  assert.equal(full.get("dates"), "20261103T190000/20261103T213000");
  assert.equal(full.get("ctz"), "America/New_York");
  assert.equal(full.get("location"), "The Venue, Bushwick");
  assert.equal(full.get("details"), "https://example.com/show");

  // No end time, including one that matches the start, runs for 2 hours.
  assert.equal(calendar({ endTime: null }).get("dates"), "20261103T190000/20261103T210000");
  assert.equal(calendar({ endTime: "19:00:00" }).get("dates"), "20261103T190000/20261103T210000");

  // After midnight, including across a month and with the 2-hour default.
  assert.equal(calendar({ startTime: "22:00:00", endTime: "01:00:00" }).get("dates"), "20261103T220000/20261104T010000");
  assert.equal(calendar({ startTime: "23:00:00", endTime: null }).get("dates"), "20261103T230000/20261104T010000");
  assert.equal(calendar({ date: "2026-12-31", startTime: "23:00:00", endTime: null }).get("dates"), "20261231T230000/20270101T010000");

  // No start time is an all-day event.
  const allDay = calendar({ startTime: null, endTime: null });
  assert.equal(allDay.get("dates"), "20261103/20261104");
  assert.equal(allDay.get("details"), "Time not listed\n\nhttps://example.com/show");

  // Special characters arrive intact, and empty fields are left out.
  const special = calendar({ name: 'Ink & Drink #3: "Live" + more', place: "Bar & Grill", link: null });
  assert.equal(special.get("text"), 'Ink & Drink #3: "Live" + more');
  assert.equal(special.get("location"), "Bar & Grill");
  assert.equal(special.has("details"), false);
  assert.equal(calendar({ place: "" }).has("location"), false);
});

test("today uses New York's date, not the server's", () => {
  assert.equal(todayInNewYork(new Date("2026-11-02T03:00:00Z")), "2026-11-01");
  assert.equal(todayInNewYork(new Date("2026-11-02T06:00:00Z")), "2026-11-02");
});
