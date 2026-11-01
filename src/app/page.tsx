import AccountMenu from "@/components/AccountMenu";
import WeekRow from "@/components/WeekRow";
import { createClient } from "@/lib/supabase/server";
import { loadWeekSummaries } from "@/lib/weeks/data";
import { todayInNewYork } from "@/lib/weeks/format";
import { isPast } from "@/lib/weeks/state";

export default async function Home() {
  const weeks = await loadWeekSummaries(await createClient());
  const today = todayInNewYork();

  return (
    <div className="wrap page">
      <div className="top">
        <h1 className="heading" style={{ fontSize: 28, fontWeight: 800 }}>dew</h1>
        <AccountMenu />
      </div>
      <div className="weeks">
        {weeks
          .filter(({ week }) => !isPast(week.start, today))
          .map((summary) => (
            <WeekRow key={summary.week.start} {...summary} today={today} />
          ))}
      </div>
    </div>
  );
}
