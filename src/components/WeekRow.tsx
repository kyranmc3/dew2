import Link from "next/link";
import { priceText, relativeWeek, shortDate, weekLabel, weekRange } from "@/lib/weeks/format";
import { bookingLine, isDecided, planIds, toReview, weekStatus } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";
import { Poster, Tag } from "./parts";

type Props = { week: WeekInfo; events: WeekEvent[]; state: WeekState; today: string };

export default function WeekRow({ week, events, state, today }: Props) {
  const status = weekStatus(week.start, today, week.isReady && events.length > 0, state);
  const rowId = `week-${week.start}`;
  const href = `/weeks/${week.start}`;
  const title = (
    <div className="c-week">
      <div className="heading" style={{ fontSize: 19 }}>{weekLabel(week.start)}</div>
      {status !== "past" && <div className="muted" style={{ fontSize: 13 }}>{relativeWeek(week.start, today)}</div>}
      <div className="muted" style={{ fontSize: 13 }}>{weekRange(week.start)}</div>
    </div>
  );

  if (status === "notReady") {
    return (
      <div className="row muted" id={rowId}>
        {title}
        <div className="c-status" style={{ fontSize: 13 }}>Not ready</div>
        <div className="c-plan">Options are still being gathered</div>
      </div>
    );
  }

  if (state.skipped) {
    return (
      <Link className="row" id={rowId} href={href}>
        {title}
        <div className="c-status"><Tag kind="soft">Skipped</Tag></div>
        <div className="c-plan muted">{status === "past" ? "You skipped this week" : "You're skipping this week"}</div>
      </Link>
    );
  }

  if (isDecided(state)) {
    const plan = planIds(state);
    const first = events.find((e) => e.id === plan[0])!;
    const others = plan.length - 1;
    const waiting = status === "decided" ? toReview(events, state).length : 0;
    return (
      <Link className="row" id={rowId} href={href}>
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
        <div className="c-next" style={{ fontWeight: 800 }}>
          {bookingLine(state)}
          {waiting > 0 && (
            <span className="to-review"> · {waiting} option{waiting === 1 ? "" : "s"} to review</span>
          )}
        </div>
      </Link>
    );
  }

  const answered = Object.keys(state.answers).length;
  if (status === "past") {
    return (
      <Link className="row" id={rowId} href={href}>
        {title}
        <div className="c-status"><Tag kind="soft">No plan</Tag></div>
        <div className="c-plan muted">{answered} of {events.length} answered</div>
      </Link>
    );
  }
  return (
    <Link className="row review" id={rowId} href={href}>
      {title}
      <div className="c-status"><Tag kind="soft">To review</Tag></div>
      <div className="c-plan" style={{ fontWeight: 800 }}>
        {answered ? `${answered} of ${events.length} answered` : `${events.length} option${events.length === 1 ? "" : "s"} to go through`}
      </div>
      <div className="c-next" style={{ fontWeight: 800, color: "var(--accent)" }}>
        {answered ? "Continue review →" : "Start review →"}
      </div>
    </Link>
  );
}
