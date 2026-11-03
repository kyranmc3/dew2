import { backupTag, checkedOn, dayLabel, googleCalendarUrl, priceText, shortDate, timeText, weekLabel, weekRange } from "@/lib/weeks/format";
import { isLocked, planIds, setBooking, toReview } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";
import { AvailabilityTag, BookingTag, ExternalLink, Poster, Tag } from "./parts";
import type { WeekActions } from "./WeekView";

type Props = { week: WeekInfo; events: WeekEvent[]; state: WeekState; readOnly: boolean; actions: WeekActions };

const BOOK_OPTIONS = [
  { value: "booked", label: "Yes", on: "on-booked", name: "Booked" },
  { value: "waitlist", label: "Waitlist", on: "on-waitlist", name: "Waitlist" },
] as const;

export default function DecidedWeek({ week, events, state, readOnly, actions }: Props) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const saidNo = events.filter((e) => state.answers[e.id] === "no");
  const plan = planIds(state);
  // A past or locked week doesn't ask for attention.
  const waiting = readOnly || isLocked(state) ? [] : toReview(events, state);
  const isWaiting = new Set(waiting.map((e) => e.id));
  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <button type="button" className="link" onClick={actions.leave}>
        {readOnly ? "← Past weeks" : "← All weeks"}
      </button>
      <div className="head">
        <div>
          <h1 className="page-title" style={{ fontSize: 40 }}>{weekLabel(week.start)}</h1>
          <div className="muted" id="week-dates">{weekRange(week.start)}</div>
        </div>
        {!readOnly && (
          <button type="button" className="btn" id="change-answers" onClick={actions.edit}>
            Change my answers
          </button>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="review-banner" id="review-banner">
          <span>
            {waiting.length} option{waiting.length === 1 ? "" : "s"} to review
          </span>
          <button type="button" className="btn" id="review-options" onClick={() => actions.reviewFrom(waiting[0].id)}>
            Review options
          </button>
        </div>
      )}

      {plan.length > 0 ? (
        <section className="section" id="your-plan">
          <h2 style={{ fontSize: 24 }}>Your plan</h2>
          <div className="plan">
            {plan.map((id) => {
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
                      {e.removed && <Tag kind="sold" large>No longer listed</Tag>}
                      {!e.removed && !booking && !readOnly && <AvailabilityTag avail={e.avail} />}
                    </div>
                    <h3 style={{ fontSize: 24 }}>{e.name}</h3>
                    <div style={{ fontWeight: 800 }}>
                      {shortDate(e.date)}, {timeText(e)} · {priceText(e.price)}
                    </div>
                    <div className="small muted">{e.place}</div>
                    {!readOnly && !e.removed && e.checkedAt && <div className="checked">Checked {checkedOn(e.checkedAt)}</div>}
                    {!readOnly && (
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
                    )}
                    {(e.link || !readOnly) && (
                      <div className="small" style={{ marginTop: "auto", paddingTop: 4, display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                        {e.link && <ExternalLink href={e.link}>Full listing</ExternalLink>}
                        {!readOnly && <ExternalLink href={googleCalendarUrl(e)} className="link calendar-link">Add to Google Calendar</ExternalLink>}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="muted" id="no-plan">You didn&apos;t save a plan for this week.</p>
      )}

      <section className="section" id="your-week" style={{ gap: 14 }}>
        <h2 style={{ fontSize: 24 }}>All Options</h2>
        <div className="days">
          {week.days.map((date) => {
            const kept = events.filter((e) => e.date === date && ((state.answers[e.id] && state.answers[e.id] !== "no") || isWaiting.has(e.id)));
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
                          {isWaiting.has(e.id) && <Tag kind="waitlist">To review</Tag>}
                          {entry ? <BookingTag booking={entry.booking} /> : rank >= 0 ? <Tag kind="rank">Ranked #{rank + 1}</Tag> : null}
                          {backup && <Tag kind="backup">{backup}</Tag>}
                          {e.removed && <Tag kind="sold">No longer listed</Tag>}
                          {!e.removed && !entry?.booking && !readOnly && <AvailabilityTag avail={e.avail} />}
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
