// Copies every Tuesday to Thursday event in the rolling window from the Notion Activity
// Database to Supabase, and copies new posters to storage. Weeks with events become
// ready. It only touches the catalog, never anyone's choices. Safe to run again.
//
//   npm run sync
//
// A poster is only copied when its Notion file changes. Add --recopy-posters to copy
// them all again, for instance after changing how they're processed.

import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "node:fs";
import { todayInNewYork } from "../src/lib/weeks/format.ts";
import { removalProblem, toEventRow, weekDays, windowMondays, type NotionPage, type PosterFile } from "./lib/notion-events.ts";
import { shrinkPoster } from "./lib/shrink-poster.ts";

const DATA_SOURCE_ID = "40ae9a68-b53c-8012-adfc-000bc54e0785";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}

const recopyPosters = process.argv.includes("--recopy-posters");
const notionToken = requireEnv("NOTION_TOKEN");
const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });

async function fetchPages(first: string, last: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2025-09-03", "Content-Type": "application/json" },
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: { and: [{ property: "Date", date: { on_or_after: first } }, { property: "Date", date: { on_or_before: last } }] },
      }),
    });
    if (!response.ok) {
      const hint = response.status === 401 ? " Check NOTION_TOKEN." : response.status === 404 ? " Share the Activity Database with the integration." : "";
      throw new Error(`Notion returned ${response.status}.${hint}`);
    }
    const body = await response.json();
    pages.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function copyPoster(eventId: string, poster: PosterFile, previousPath: string | null): Promise<string> {
  const download = await fetch(poster.url);
  if (!download.ok) throw new Error(`download returned ${download.status}`);
  const image = await shrinkPoster(await download.arrayBuffer());
  const path = `${eventId}.webp`;
  const { error } = await supabase.storage.from("posters").upload(path, image, { contentType: "image/webp", upsert: true });
  if (error) throw new Error(error.message);
  if (previousPath && previousPath !== path) await supabase.storage.from("posters").remove([previousPath]);
  return path;
}

async function sync() {
  const mondays = windowMondays(todayInNewYork());
  const weeks = mondays.map((start_date) => ({ start_date, days: weekDays(start_date) }));
  const allDays = new Set(weeks.flatMap((w) => w.days));
  const first = weeks[0].days[0];
  const last = weeks.at(-1)!.days.at(-1)!;

  const parsed = (await fetchPages(first, last)).map(toEventRow);
  const warnings = parsed.flatMap((p) => p.warnings);
  const usable = parsed.flatMap((p) => (p.row && allDays.has(p.row.event_date) ? [{ row: p.row, poster: p.poster }] : []));
  if (usable.length === 0) throw new Error(`Notion returned no events for ${first} to ${last}, so nothing was changed.`);
  const ids = new Set(usable.map((u) => u.row.id));

  const { data: active, error: activeError } = await supabase.from("events").select("id, name").eq("is_active", true).gte("event_date", first).lte("event_date", last);
  if (activeError) throw new Error(activeError.message);
  const removed = active.filter((e) => !ids.has(e.id));
  const problem = removalProblem(active.length, removed.length);
  if (problem) throw new Error(`${problem} That looks wrong, so nothing was changed.`);

  const { data: existing, error: readError } = await supabase.from("events").select("id, name, event_date, poster_path, poster_source").in("id", [...ids]);
  if (readError) throw new Error(readError.message);
  const known = new Map(existing.map((e) => [e.id, e]));

  let copied = 0;
  const added: string[] = [];
  const moved: string[] = [];
  const syncedAt = new Date().toISOString();
  const rows = [];
  for (const { row, poster } of usable) {
    const before = known.get(row.id);
    if (!before) added.push(`${row.name} (${row.event_date})`);
    else if (before.event_date !== row.event_date) moved.push(`${row.name}: ${before.event_date} to ${row.event_date}`);
    let poster_path: string | null = before?.poster_path ?? null;
    let poster_source: string | null = before?.poster_source ?? null;
    if (poster && (recopyPosters || poster.source !== poster_source)) {
      try {
        poster_path = await copyPoster(row.id, poster, poster_path);
        poster_source = poster.source;
        copied += 1;
      } catch (error) {
        warnings.push(`${row.name}: poster not copied (${(error as Error).message})`);
      }
    }
    // Some posters only exist in storage, so this checks the result rather than Notion.
    if (!poster_path) warnings.push(`${row.name}: no poster`);
    rows.push({ ...row, poster_path, poster_source, is_active: true, synced_at: syncedAt });
  }

  const { error: writeError } = await supabase.from("events").upsert(rows);
  if (writeError) throw new Error(writeError.message);

  // Removed events stay in the database, because answers may point at them.
  if (removed.length) {
    const { error } = await supabase.from("events").update({ is_active: false }).in("id", removed.map((e) => e.id));
    if (error) throw new Error(error.message);
  }

  // Day notes aren't in this upsert, so any already on a week are kept.
  const days = rows.map((r) => r.event_date);
  const weekRows = weeks.map((w) => ({ ...w, is_ready: w.days.some((d) => days.includes(d)) }));
  const { error: weekError } = await supabase.from("weeks").upsert(weekRows);
  if (weekError) throw new Error(weekError.message);

  const lines = [
    `Synced ${first} to ${last}: ${rows.length} events, ${added.length} added, ${removed.length} removed, ${moved.length} moved, ${copied} posters copied.`,
    `Ready weeks: ${weekRows.filter((w) => w.is_ready).map((w) => w.start_date).join(", ")}`,
    ...added.map((a) => `Added: ${a}`),
    ...removed.map((e) => `Removed: ${e.name}`),
    ...moved.map((m) => `Moved: ${m}`),
    ...warnings.map((w) => `Warning: ${w}`),
  ];
  lines.forEach((line) => console.log(line));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((line) => `- ${line}`).join("\n") + "\n");
}

await sync();
