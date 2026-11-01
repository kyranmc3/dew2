import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import { Poster, Tag } from "@/components/parts";
import { createClient } from "@/lib/supabase/server";
import { loadAllChoices, loadEvents, loadWeeks } from "@/lib/weeks/data";
import { priceText, relativeWeek, shortDate, todayInNewYork, weekLabel, weekRange } from "@/lib/weeks/format";
import { bookingLine, buildState, isDecided, planIds } from "@/lib/weeks/state";

export default async function Home() {
  const supabase = await createClient();
  const weeks = await loadWeeks(supabase);
  const ready = weeks.filter((w) => w.isReady);
  const [{ events }, choices] = await Promise.all([
    ready.length ? loadEvents(supabase, ready[0].days[0], ready.at(-1)!.days.at(-1)!) : { events: [] },
    loadAllChoices(supabase),
  ]);
  const today = todayInNewYork();

  return (
    <div className="wrap page">
      <div className="top">
        <h1 className="heading" style={{ fontSize: 28, fontWeight: 800 }}>dew</h1>
        <AccountMenu />
      </div>
      <div className="weeks">
        {weeks.map((week) => {
          const title = (
            <div className="c-week">
              <div className="heading" style={{ fontSize: 19 }}>{weekLabel(week.start)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{relativeWeek(week.start, today)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{weekRange(week.start)}</div>
            </div>
          );
          const rowId = `week-${week.start}`;
          if (!week.isReady) {
            return (
              <div className="row muted" id={rowId} key={week.start}>
                {title}
                <div className="c-status" style={{ fontSize: 13 }}>Not ready</div>
                <div className="c-plan">Options are still being gathered</div>
              </div>
            );
          }

          const weekEvents = events.filter((e) => week.days.includes(e.date));
          const state = buildState(new Set(weekEvents.map((e) => e.id)), choices.responses, choices.plan, choices.weekStates.find((s) => s.week_start === week.start));
          const href = `/weeks/${week.start}`;

          if (state.skipped) {
            return (
              <Link className="row" id={rowId} href={href} key={week.start}>
                {title}
                <div className="c-status"><Tag kind="soft">Skipped</Tag></div>
                <div className="c-plan muted">You&apos;re skipping this week</div>
              </Link>
            );
          }

          if (isDecided(state)) {
            const plan = planIds(state);
            const first = weekEvents.find((e) => e.id === plan[0])!;
            const others = plan.length - 1;
            return (
              <Link className="row" id={rowId} href={href} key={week.start}>
                {title}
                <div className="c-status"><Tag kind="going">Decided</Tag></div>
                <div className="c-plan">
                  <Poster event={first} alt="" className="thumb" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>
                      {first.name}
                      {others > 0 && <span className="others"> (+{others} other{others === 1 ? "" : "s"})</span>}
                    </div>
                    <div className="small muted">
                      {shortDate(first.date)}, {first.start ?? "Time not listed"} · {priceText(first.price)}
                    </div>
                  </div>
                </div>
                <div className="c-next" style={{ fontWeight: 800 }}>{bookingLine(state)}</div>
              </Link>
            );
          }

          const answered = Object.keys(state.answers).length;
          return (
            <Link className="row review" id={rowId} href={href} key={week.start}>
              {title}
              <div className="c-status"><Tag kind="soft">To review</Tag></div>
              <div className="c-plan" style={{ fontWeight: 800 }}>
                {answered ? `${answered} of ${weekEvents.length} answered` : `${weekEvents.length} options to go through`}
              </div>
              <div className="c-next" style={{ fontWeight: 800, color: "var(--accent)" }}>
                {answered ? "Continue review →" : "Start review →"}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
