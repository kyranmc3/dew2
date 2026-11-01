// Turns Notion Activity Database rows into rows for the events table.

type NotionProperty = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type NotionPage = { id: string; last_edited_time?: string; properties: Record<string, NotionProperty> };

export type PosterFile = { url: string; source: string };

export type EventRow = {
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
  notion_edited_at: string | null;
};

const text = (prop?: NotionProperty): string | null => {
  const parts = prop?.title ?? prop?.rich_text ?? [];
  const joined = parts.map((part: { plain_text: string }) => part.plain_text).join("").trim();
  return joined || null;
};
const select = (prop?: NotionProperty): string | null => prop?.select?.name ?? null;

// "7:00 PM", "7 PM" or "19:00" becomes "19:00". Anything else is null.
export function parseTime(value: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem && (hours < 1 || hours > 12)) return null;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function toEventRow(page: NotionPage): { row: EventRow | null; poster: PosterFile | null; warnings: string[] } {
  const p = page.properties;
  const id = page.id.replaceAll("-", "");
  const name = text(p["Name"]);
  const date: string | undefined = p["Date"]?.date?.start;
  const label = name ?? id;
  if (!name || !date) return { row: null, poster: null, warnings: [`Skipped ${label}: no name or date`] };

  const warnings: string[] = [];
  const startText = text(p["Start Time"]);
  const endText = text(p["End Time"]);
  const start_time = parseTime(startText);
  const end_time = parseTime(endText);
  if (!start_time) warnings.push(`${label}: start time is ${startText ? `unreadable ("${startText}")` : "missing"}`);
  if (endText && !end_time) warnings.push(`${label}: end time is unreadable ("${endText}")`);
  const link: string | null = p["Source Link"]?.url ?? null;
  if (!link) warnings.push(`${label}: no link`);

  const file = p["Poster or Image"]?.files?.[0];
  const url: string | undefined = file?.file?.url ?? file?.external?.url;

  return {
    row: {
      id,
      name,
      source: select(p["Source"]),
      type: select(p["Type"]),
      format: select(p["Format"]),
      featuring: text(p["Featuring"]),
      venue: text(p["Venue"]),
      neighborhood: select(p["Neighborhood"]),
      event_date: date.slice(0, 10),
      start_time,
      end_time,
      price: p["Price"]?.number ?? null,
      availability: select(p["Availability"]),
      link,
      description: text(p["Description"]),
      notion_edited_at: page.last_edited_time ?? null,
    },
    // Notion's file links change on every read, but the path stays the same for the same file.
    poster: url ? { url, source: new URL(url).pathname } : null,
    warnings,
  };
}

// Tuesday to Thursday of the week starting on this Monday.
export function weekDays(monday: string): string[] {
  const start = new Date(`${monday}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.getUTCDay() !== 1 || start.toISOString().slice(0, 10) !== monday) {
    throw new Error(`${monday} isn't a Monday in YYYY-MM-DD form`);
  }
  return [1, 2, 3].map((offset) => new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10));
}

// This week and the next 8. The new week starts on Sunday, the day before its Monday.
export function windowMondays(today: string, weeksAhead = 8): string[] {
  const day = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  const monday = new Date(day.getTime() - sinceMonday * 86400000);
  const first = sinceMonday === 6 ? monday.getTime() + 7 * 86400000 : monday.getTime();
  return Array.from({ length: weeksAhead + 1 }, (_, i) => new Date(first + i * 7 * 86400000).toISOString().slice(0, 10));
}

// Stops a bad Notion response or a renamed property from emptying the catalog.
export function removalProblem(activeCount: number, removeCount: number): string | null {
  if (removeCount >= 3 && removeCount > activeCount / 2) return `This would remove ${removeCount} of ${activeCount} active events.`;
  return null;
}
