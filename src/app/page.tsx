import AccountMenu from "@/components/AccountMenu";
import WeekRow from "@/components/WeekRow";
import { createClient } from "@/lib/supabase/server";
import { loadWeekSummaries } from "@/lib/weeks/data";
import { todayInNewYork } from "@/lib/weeks/format";
import { isPast } from "@/lib/weeks/state";

export default async function Home() {
  const today = todayInNewYork();
  const weeks = await loadWeekSummaries(await createClient(), today);

  return (
    <div className="wrap page">
      <div className="top">
        <h1 className="heading" style={{ fontSize: 28, fontWeight: 800 }}>dew</h1>
        <AccountMenu />
      </div>
      <div className="weeks">
        {weeks
          .filter(({ week }) => !isPast(week.start, today))
          .map(({ week, events, state }) => (
            <WeekRow key={week.start} week={week} events={events} state={state} today={today} />
          ))}
      </div>
    </div>
  );
}
