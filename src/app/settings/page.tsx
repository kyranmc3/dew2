import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSettled } from "@/lib/weeks/days";
import { loadSources, loadWeekdays, loadWeekSummaries } from "@/lib/weeks/data";
import { todayInNewYork, weekLabel } from "@/lib/weeks/format";
import { hasPassed, isPast } from "@/lib/weeks/state";
import DaysForm from "./DaysForm";

export const metadata: Metadata = { title: "Settings · dew" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayInNewYork();
  const [sources, weekdays, weeks] = await Promise.all([loadSources(supabase), loadWeekdays(supabase), loadWeekSummaries(supabase, today)]);
  // Settled weeks keep their days, so a change starts at the first week that isn't settled.
  const open = weeks.filter(({ week, full }) => !isPast(week.start, today) && !isSettled(full));
  const appliesFrom = open.length ? weekLabel(open[0].week.start).replace("Week of", "the week of") : null;
  const current = open.find(({ week }) => week.days.some((d) => hasPassed(d, today)));
  const keepCurrentWeek = current
    ? { week_start: current.week.start, is_saved: current.full.saved, is_skipped: current.full.skipped, days: current.week.days }
    : null;

  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <Link className="link" href="/">← All weeks</Link>
      <h1 className="page-title" style={{ fontSize: 40 }}>Settings</h1>
      <section className="section" id="settings-days">
        <h2 style={{ fontSize: 24 }}>Days</h2>
        <DaysForm userId={user.id} initial={weekdays} appliesFrom={appliesFrom} keepCurrentWeek={keepCurrentWeek} />
      </section>
      <section className="section" id="settings-sources">
        <h2 style={{ fontSize: 24 }}>Sources</h2>
        <ul className="pills" aria-label="Sources">
          {sources.map((s) => (
            <li key={s} className="on" aria-label={`${s}, selected`}>
              {s}
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: 0 }}>Sources can&apos;t be changed yet.</p>
      </section>
    </div>
  );
}
