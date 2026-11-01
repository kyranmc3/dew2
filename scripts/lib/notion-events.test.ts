import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTime, removalProblem, toEventRow, weekDays, windowMondays, type NotionPage } from "./notion-events.ts";

test("parseTime reads the formats in Notion", () => {
  assert.equal(parseTime("7:00 PM"), "19:00");
  assert.equal(parseTime("7 pm"), "19:00");
  assert.equal(parseTime("12:30 PM"), "12:30");
  assert.equal(parseTime("12:00 AM"), "00:00");
  assert.equal(parseTime("10:15 AM"), "10:15");
  assert.equal(parseTime("19:00"), "19:00");
  assert.equal(parseTime(""), null);
  assert.equal(parseTime(null), null);
  assert.equal(parseTime("TBD"), null);
  assert.equal(parseTime("13:00 PM"), null);
  assert.equal(parseTime("25:00"), null);
});

const rich = (value: string) => ({ rich_text: [{ plain_text: value }] });
const fullPage: NotionPage = {
  id: "11111111-2222-3333-4444-555555555555",
  last_edited_time: "2026-11-01T20:00:00.000Z",
  properties: {
    Name: { title: [{ plain_text: "Issadora " }, { plain_text: "Ava" }] },
    Date: { date: { start: "2026-11-03" } },
    "Start Time": rich("7:00 PM"),
    "End Time": { rich_text: [] },
    Description: rich("Indie pop."),
    Featuring: rich("Issadora Ava, Nikita Lev"),
    Venue: rich("Baby's All Right"),
    Neighborhood: { select: { name: "Williamsburg" } },
    Source: { select: { name: "Baby's All Right" } },
    Type: { select: { name: "Concert" } },
    Format: { select: null },
    Availability: { select: { name: "Available" } },
    Price: { number: 24.74 },
    "Source Link": { url: "https://example.com/show" },
    "Poster or Image": { files: [{ file: { url: "https://files.example.com/a/b/poster.jpg?signature=abc" } }] },
  },
};

test("toEventRow maps every field", () => {
  const { row, poster, warnings } = toEventRow(fullPage);
  assert.deepEqual(warnings, []);
  assert.deepEqual(row, {
    id: "11111111222233334444555555555555",
    name: "Issadora Ava",
    source: "Baby's All Right",
    type: "Concert",
    format: null,
    featuring: "Issadora Ava, Nikita Lev",
    venue: "Baby's All Right",
    neighborhood: "Williamsburg",
    event_date: "2026-11-03",
    start_time: "19:00",
    end_time: null,
    price: 24.74,
    availability: "Available",
    link: "https://example.com/show",
    description: "Indie pop.",
    notion_edited_at: "2026-11-01T20:00:00.000Z",
  });
  assert.deepEqual(poster, { url: "https://files.example.com/a/b/poster.jpg?signature=abc", source: "/a/b/poster.jpg" });
});

test("a free event keeps its price of 0", () => {
  const page = { ...fullPage, properties: { ...fullPage.properties, Price: { number: 0 } } };
  assert.equal(toEventRow(page).row?.price, 0);
});

test("toEventRow keeps a row with gaps and warns about them", () => {
  const page: NotionPage = { id: "x", properties: { Name: { title: [{ plain_text: "Gaps" }] }, Date: { date: { start: "2026-11-03T19:00:00.000-05:00" } }, "Start Time": rich("late") } };
  const { row, poster, warnings } = toEventRow(page);
  assert.equal(row?.event_date, "2026-11-03");
  assert.equal(row?.start_time, null);
  assert.equal(poster, null);
  assert.equal(warnings.length, 2);
});

test("toEventRow skips a row with no name or date", () => {
  assert.equal(toEventRow({ id: "x", properties: { Date: { date: { start: "2026-11-03" } } } }).row, null);
  assert.equal(toEventRow({ id: "x", properties: { Name: { title: [{ plain_text: "No date" }] }, Date: { date: null } } }).row, null);
});

test("weekDays gives Tuesday to Thursday and rejects anything but a Monday", () => {
  assert.deepEqual(weekDays("2026-11-30"), ["2026-12-01", "2026-12-02", "2026-12-03"]);
  assert.throws(() => weekDays("2026-12-01"));
  assert.throws(() => weekDays("soon"));
});

test("windowMondays covers this week and the next 8", () => {
  const monday = windowMondays("2026-11-02");
  assert.equal(monday.length, 9);
  assert.equal(monday[0], "2026-11-02");
  assert.equal(monday[8], "2026-12-28");
  assert.equal(windowMondays("2026-11-05")[0], "2026-11-02");
});

test("the window rolls over on Sunday", () => {
  assert.equal(windowMondays("2026-11-06")[0], "2026-11-02");
  assert.equal(windowMondays("2026-11-07")[0], "2026-11-02");
  assert.equal(windowMondays("2026-11-08")[0], "2026-11-09");
  assert.equal(windowMondays("2026-11-01")[0], "2026-11-02");
});

test("removalProblem stops large removals only", () => {
  assert.equal(removalProblem(40, 3), null);
  assert.equal(removalProblem(40, 20), null);
  assert.notEqual(removalProblem(40, 21), null);
  assert.equal(removalProblem(2, 2), null);
  assert.notEqual(removalProblem(4, 3), null);
});
