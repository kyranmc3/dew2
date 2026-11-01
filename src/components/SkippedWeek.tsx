import { weekLabel, weekRange } from "@/lib/weeks/format";
import type { WeekInfo, WeekState } from "@/lib/weeks/types";
import type { WeekActions } from "./WeekView";

export default function SkippedWeek({ week, actions }: { week: WeekInfo; state: WeekState; actions: WeekActions }) {
  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <button type="button" className="link" onClick={actions.leave}>
        ← All weeks
      </button>
      <div>
        <h1 className="page-title" style={{ fontSize: 40 }}>{weekLabel(week.start)}</h1>
        <div className="muted" id="week-dates">{weekRange(week.start)}</div>
      </div>
      <section className="skipped" id="skipped">
        <h2 style={{ fontSize: 24 }}>You&apos;re skipping this week</h2>
        <p className="muted">Your answers are kept if you change your mind.</p>
        <button
          type="button"
          className="btn"
          id="unskip"
          style={{ marginTop: 6 }}
          onClick={() => {
            actions.change((s) => ({ ...s, skipped: false }));
            window.scrollTo({ top: 0 });
          }}
        >
          Review this week
        </button>
      </section>
    </div>
  );
}
