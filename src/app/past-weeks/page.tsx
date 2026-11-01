import type { Metadata } from "next";
import Link from "next/link";
import WeekRow from "@/components/WeekRow";
import { createClient } from "@/lib/supabase/server";
import { loadWeekSummaries } from "@/lib/weeks/data";
import { todayInNewYork } from "@/lib/weeks/format";
import { hasChoices, isPast } from "@/lib/weeks/state";

export const metadata: Metadata = { title: "Past Weeks · dew" };

export default async function PastWeeksPage() {
  const weeks = await loadWeekSummaries(await createClient());
  const today = todayInNewYork();
  const past = weeks
    .filter(({ week, state }) => isPast(week.start, today) && (hasChoices(state) || state.skipped))
    .reverse();

  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <Link className="link" href="/">← All weeks</Link>
      <h1 className="page-title" style={{ fontSize: 40 }}>Past Weeks</h1>
      {past.length ? (
        <div className="weeks" id="past-weeks">
          {past.map((summary) => (
            <WeekRow key={summary.week.start} {...summary} today={today} />
          ))}
        </div>
      ) : (
        <p className="muted">No past weeks yet.</p>
      )}
    </div>
  );
}
