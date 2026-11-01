// Copies a week's events from the Notion Activity Database to Supabase, copies their
// posters to storage, and marks the week ready. Safe to run again.
//
//   npm run sync -- 2026-11-30 [more Mondays]
//
// A poster is only copied when its Notion file changes. Add --recopy-posters to copy
// them all again, for instance after changing how they're processed.

import { createClient } from "@supabase/supabase-js";
import { toEventRow, weekDays, type NotionPage, type PosterFile } from "./lib/notion-events.ts";
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

async function syncWeek(monday: string) {
  const days = weekDays(monday);
  const parsed = (await fetchPages(days[0], days[2])).map(toEventRow);
  const warnings = parsed.flatMap((p) => p.warnings);
  const usable = parsed.flatMap((p) => (p.row && days.includes(p.row.event_date) ? [{ row: p.row, poster: p.poster }] : []));

  if (usable.length === 0) {
    console.log(`${monday}: no events in Notion for ${days[0]} to ${days[2]}. The week wasn't marked ready.`);
    return;
  }

  const ids = usable.map((u) => u.row.id);
  const { data: existing, error: readError } = await supabase.from("events").select("id, poster_path, poster_source").in("id", ids);
  if (readError) throw new Error(readError.message);
  const known = new Map(existing.map((e) => [e.id, e]));

  let copied = 0;
  const syncedAt = new Date().toISOString();
  const rows = [];
  for (const { row, poster } of usable) {
    const before = known.get(row.id);
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
    rows.push({ ...row, poster_path, poster_source, is_active: true, synced_at: syncedAt });
  }

  const { error: writeError } = await supabase.from("events").upsert(rows);
  if (writeError) throw new Error(writeError.message);

  // Events removed from Notion stay in the database, because answers may point at them.
  const { data: removed, error: removeError } = await supabase
    .from("events")
    .update({ is_active: false })
    .gte("event_date", days[0])
    .lte("event_date", days[2])
    .eq("is_active", true)
    .not("id", "in", `(${ids.join(",")})`)
    .select("name");
  if (removeError) throw new Error(removeError.message);

  const { error: weekError } = await supabase.from("weeks").upsert({ start_date: monday, days, is_ready: true });
  if (weekError) throw new Error(weekError.message);

  console.log(`${monday}: ${rows.length} events, ${copied} posters copied, ${removed.length} removed. The week is ready.`);
  removed.forEach((e) => console.log(`  Removed: ${e.name}`));
  warnings.forEach((w) => console.log(`  Warning: ${w}`));
}

const mondays = process.argv.slice(2).filter((arg) => arg !== "--recopy-posters");
if (mondays.length === 0) {
  console.error("Name at least one Monday: npm run sync -- 2026-11-30");
  process.exit(1);
}
for (const monday of mondays) await syncWeek(monday);
