import { backupTag, checkedOn, dayLabel, priceText, shortDate, timeText, weekLabel, weekRange } from "@/lib/weeks/format";
import { planIds, setBooking } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";
import { AvailabilityTag, BookingTag, ExternalLink, Poster, Tag } from "./parts";
import type { WeekActions } from "./WeekView";

type Props = { week: WeekInfo; events: WeekEvent[]; checkedAt: string | null; state: WeekState; actions: WeekActions };

const BOOK_OPTIONS = [
  { value: "booked", label: "Yes", on: "on-booked", name: "Booked" },
  { value: "waitlist", label: "Waitlist", on: "on-waitlist", name: "Waitlist" },
] as const;

export default function DecidedWeek({ week, events, checkedAt, state, actions }: Props) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const saidNo = events.filter((e) => state.answers[e.id] === "no");
  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <button type="button" className="link" onClick={actions.leave}>
        ← All weeks
      </button>
      <div className="head">
        <div>
          <h1 className="page-title" style={{ fontSize: 40 }}>{weekLabel(week.start)}</h1>
          <div className="muted" id="week-dates">{weekRange(week.start)}</div>
        </div>
        <button type="button" className="btn" id="change-answers" onClick={actions.edit}>
          Change my answers
        </button>
      </div>

      <section className="section" id="your-plan">
        <h2 style={{ fontSize: 24 }}>Your plan</h2>
        <div className="plan">
          {planIds(state).map((id) => {
            const e = byId.get(id)!;
            const booking = state.plan[id].booking;
            return (
              <article className="plan-card" id={`plan-${e.id}`} key={e.id}>
                <div className="plan-img">
                  <Poster event={e} alt={`${e.name} poster`} />
                </div>
                <div className="plan-body">
                  <div className="tags" style={{ marginTop: 0 }}>
                    <BookingTag booking={booking} large />
                    {!booking && <AvailabilityTag avail={e.avail} />}
                  </div>
                  <h3 style={{ fontSize: 24 }}>{e.name}</h3>
                  <div style={{ fontWeight: 800 }}>
                    {shortDate(e.date)}, {timeText(e)} · {priceText(e.price)}
                  </div>
                  <div className="small muted">{e.place}</div>
                  <div className="booked-ask">
                    <span style={{ fontWeight: 800 }}>Booked?</span>
                    <div className="booked-btns" role="group" aria-label={`Booked ${e.name}?`}>
                      {BOOK_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`btn${booking === o.value ? ` ${o.on}` : ""}`}
                          aria-pressed={booking === o.value}
                          aria-label={`${o.name}: ${e.name}`}
                          onClick={() => actions.change((s) => setBooking(s, e.id, o.value))}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {e.link && (
                    <div className="small" style={{ marginTop: "auto", paddingTop: 4 }}>
                      <ExternalLink href={e.link}>Full listing</ExternalLink>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section" id="your-week" style={{ gap: 14 }}>
        <h2 style={{ fontSize: 24 }}>All Options</h2>
        {checkedAt && <p className="checked">Prices and availability as of {checkedOn(checkedAt)}</p>}
        <div className="days">
          {week.days.map((date) => {
            const kept = events.filter((e) => e.date === date && state.answers[e.id] && state.answers[e.id] !== "no");
            return (
              <div className="day" id={`day-${date}`} key={date}>
                <h3 className="day-title">{dayLabel(date)}</h3>
                {kept.map((e) => {
                  const entry = state.plan[e.id];
                  const rank = state.ranking.indexOf(e.id);
                  const backup = backupTag(e);
                  return (
                    <div className={`item ${entry ? entry.booking || "notbooked" : ""}`} id={`item-${e.id}`} key={e.id}>
                      <Poster event={e} alt="" />
                      <div style={{ minWidth: 0 }}>
                        <ExternalLink href={e.link} className="">{e.name}</ExternalLink>
                        <div className="small muted">
                          {e.start ?? "Time not listed"} · {priceText(e.price)}
                        </div>
                        <div className="tags">
                          {entry ? <BookingTag booking={entry.booking} /> : rank >= 0 ? <Tag kind="rank">Ranked #{rank + 1}</Tag> : null}
                          {backup && <Tag kind="backup">{backup}</Tag>}
                          {!entry?.booking && <AvailabilityTag avail={e.avail} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!kept.length && <p className="small muted">{week.dayNotes[date] || "Nothing saved for this night."}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {saidNo.length > 0 && (
        <details className="small muted" id="said-no">
          <summary>{saidNo.length} you said no to</summary>
          <ul>
            {saidNo.map((e) => (
              <li key={e.id}>
                {e.name} · {shortDate(e.date)}, {e.start ?? "Time not listed"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
