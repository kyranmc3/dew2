"use client";

import { useEffect, useRef, useState } from "react";
import { checkedOn, dayLabel, priceText, shortDate, timeText, weekLabel, weekRange } from "@/lib/weeks/format";
import { answerEvent, canSave, commitEvent, hasChoices, moveEvent } from "@/lib/weeks/state";
import { EMPTY_STATE, type Answer, type WeekEvent, type WeekInfo, type WeekState } from "@/lib/weeks/types";
import MoreMenu from "./MoreMenu";
import { AvailabilityTag, ExternalLink, Poster, Tag } from "./parts";
import type { WeekActions } from "./WeekView";

type Props = { week: WeekInfo; events: WeekEvent[]; state: WeekState; actions: WeekActions };

const ANSWERS: { value: Answer; label: string }[] = [
  { value: "no", label: "No" },
  { value: "maybe", label: "Maybe" },
  { value: "yes", label: "Yes" },
];

function EventCard({ event: e, state, actions }: { event: WeekEvent; state: WeekState; actions: WeekActions }) {
  const current = state.answers[e.id];
  return (
    <article className={`card${current ? ` a-${current}` : ""}`} id={`event-${e.id}`}>
      <Poster event={e} alt={`${e.name} poster`} />
      <div className="card-body">
        <div className="card-meta">
          <span>{[e.type, e.format, e.place].filter(Boolean).join(" · ")}</span>
          {e.removed ? <Tag kind="sold">No longer listed</Tag> : <AvailabilityTag avail={e.avail} />}
        </div>
        <h3 style={{ fontSize: 20 }}>{e.name}</h3>
        <div className="small" style={{ fontWeight: 800 }}>
          {timeText(e)} · {priceText(e.price)}
        </div>
        {e.desc && <p className="small" style={{ marginTop: 2 }}>{e.desc}</p>}
        {e.link && (
          <span style={{ fontSize: 13 }}>
            <ExternalLink href={e.link}>Full listing</ExternalLink>
          </span>
        )}
      </div>
      <div className="decide">
        <div className="ask" aria-hidden="true">Are you interested?</div>
        <div className="answers" role="group" aria-label={`Are you interested in ${e.name}?`}>
          {ANSWERS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={`btn${current === a.value ? ` on-${a.value}` : ""}`}
              aria-pressed={current === a.value}
              onClick={() => actions.change((s) => answerEvent(s, e.id, a.value))}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function ShortlistRow({ event: e, index, state, actions }: { event: WeekEvent; index: number; state: WeekState; actions: WeekActions }) {
  const committed = !!state.plan[e.id];
  return (
    <div className="pick" id={`pick-${e.id}`}>
      <div className="pick-top">
        <span className="heading pick-rank">{index + 1}</span>
        <Poster event={e} alt="" />
        <span className="pick-name">
          <b style={{ fontWeight: 800 }}>{e.name}</b>
          <br />
          {shortDate(e.date)}, {e.start ?? "Time not listed"} · {priceText(e.price)}
          {e.removed && (
            <>
              <br />
              <Tag kind="sold">No longer listed</Tag>
            </>
          )}
          {!e.removed && e.checkedAt && (
            <>
              <br />
              <span className="checked">Checked {checkedOn(e.checkedAt)}</span>
            </>
          )}
        </span>
        <div className="arrows">
          <button type="button" className="btn" disabled={index === 0} aria-label={`Move ${e.name} up`} onClick={() => actions.change((s) => moveEvent(s, e.id, -1))}>
            ↑
          </button>
          <button type="button" className="btn" disabled={index === state.ranking.length - 1} aria-label={`Move ${e.name} down`} onClick={() => actions.change((s) => moveEvent(s, e.id, 1))}>
            ↓
          </button>
        </div>
      </div>
      <div className="pick-actions">
        <button
          type="button"
          className={`btn${committed ? " on-commit" : ""}`}
          aria-pressed={committed}
          aria-label={`Commit: ${e.name}`}
          onClick={() => actions.change((s) => commitEvent(s, e.id))}
        >
          {committed ? "Committed" : "Commit"}
        </button>
        {e.link && (
          <ExternalLink href={e.link} className="">
            {e.price === 0 ? "Sign up ↗" : "Get tickets ↗"}
          </ExternalLink>
        )}
      </div>
    </div>
  );
}

export default function ReviewWeek({ week, events, state, actions }: Props) {
  const byId = new Map(events.map((e) => [e.id, e]));
  const answered = events.filter((e) => state.answers[e.id]).length;
  const committed = Object.keys(state.plan).length;
  const summary = [`${answered} of ${events.length} answered`, `${state.ranking.length} on your shortlist`, committed && `${committed} committed`].filter(Boolean).join(" · ");
  const maybes = events.filter((e) => state.answers[e.id] === "maybe");

  // The bar's height changes as it wraps, and the day headers stick right below it.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current!;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const openButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const closeSheet = () => {
    setSheetOpen(false);
    openButton.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!sheetOpen) return;
    // The sheet can't take focus until its slide has started.
    const focus = setTimeout(() => doneButton.current?.focus({ preventScroll: true }), 50);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".menu")) return;
      setSheetOpen(false);
      openButton.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focus);
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const reset = () => {
    dialogRef.current?.close();
    setSheetOpen(false);
    actions.change(() => EMPTY_STATE);
    actions.stopEditing();
  };

  return (
    <>
      <div className="bar" id="save-bar" ref={barRef}>
        <div className="wrap bar-in">
          <div className="bar-left">
            <button type="button" className="link" aria-label="All weeks" onClick={actions.leave}>
              ←<span className="hide-phone"> All weeks</span>
            </button>
            <div className="bar-title">
              <h1 style={{ fontSize: 32 }}>
                <span className="hide-phone">Week of </span>
                {weekLabel(week.start).replace("Week of ", "")}
              </h1>
              <div className="small muted bar-dates" id="week-dates">{weekRange(week.start)}</div>
            </div>
          </div>
          <div className="bar-right">
            <span className="small muted bar-summary" aria-live="polite">{summary}</span>
            <button ref={openButton} type="button" className="btn sheet-btn" id="open-sheet" aria-expanded={sheetOpen} aria-controls="rail" onClick={() => (sheetOpen ? closeSheet() : setSheetOpen(true))}>
              Shortlist ({state.ranking.length})
            </button>
            <button
              type="button"
              className="save"
              id="save-plan"
              aria-label="Save your plan"
              disabled={!canSave(state)}
              onClick={() => {
                setSheetOpen(false);
                actions.change((s) => ({ ...s, saved: true }));
                actions.stopEditing();
              }}
            >
              Save<span className="hide-phone"> your plan</span>
            </button>
            <MoreMenu
              onSkip={() => {
                setSheetOpen(false);
                actions.change((s) => ({ ...s, skipped: true }));
                actions.stopEditing();
              }}
              onReset={() => {
                if (hasChoices(state)) dialogRef.current?.showModal();
              }}
            />
          </div>
        </div>
      </div>

      <div className={`scrim${sheetOpen ? " open" : ""}`} id="scrim" onClick={closeSheet} />

      <div className="wrap cols">
        <div className="main">
          <div className="phone-sum" aria-live="polite">
            {weekRange(week.start)}
            <br />
            {summary}
          </div>
          {week.days.map((date) => {
            const dayEvents = events.filter((e) => e.date === date);
            const saidNo = dayEvents.filter((e) => state.answers[e.id] === "no");
            return (
              <section className="section" id={`day-${date}`} aria-label={dayLabel(date)} key={date}>
                <div className="day-head">
                  <h2 className="section-title">{dayLabel(date)}</h2>
                </div>
                {dayEvents
                  .filter((e) => state.answers[e.id] !== "no")
                  .map((e) => (
                    <EventCard key={e.id} event={e} state={state} actions={actions} />
                  ))}
                {saidNo.map((e) => (
                  <div className="said-no" id={`no-${e.id}`} key={e.id}>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontWeight: 800 }}>No:</b> {e.name} · <span className="said-no-time">{e.start ?? "Time not listed"}</span>
                    </span>
                    <button type="button" className="link" aria-label={`Restore ${e.name}`} onClick={() => actions.change((s) => answerEvent(s, e.id, "no"))}>
                      Restore
                    </button>
                  </div>
                ))}
                {!dayEvents.length && <p className="muted">{week.dayNotes[date] || "Nothing is listed for this night."}</p>}
              </section>
            );
          })}
        </div>

        <aside className={`rail${sheetOpen ? " open" : ""}`} id="rail" aria-label="Your shortlist">
          <div className="sheet-head">
            <button ref={doneButton} type="button" className="btn" id="close-sheet" onClick={closeSheet}>
              Done
            </button>
          </div>
          <section className="shortlist" id="shortlist">
            <div>
              <h2 style={{ fontSize: 24 }}>Your shortlist</h2>
              <p className="small muted" style={{ marginTop: 2 }}>
                {state.ranking.length ? "Put your yeses in order, then commit to what you'll do." : "Everything you say yes to lands here."}
              </p>
            </div>
            {state.ranking.map((id, i) => {
              const e = byId.get(id);
              return e ? <ShortlistRow key={id} event={e} index={i} state={state} actions={actions} /> : null;
            })}
            {state.ranking.length > 0 && !canSave(state) && <p className="small warn">Commit to at least one to save your plan.</p>}
          </section>
          <section className="maybes" id="maybes">
            <h2>Your maybes</h2>
            {maybes.map((e) => (
              <p className="small" key={e.id}>
                {e.name}, {shortDate(e.date)}
              </p>
            ))}
            {!maybes.length && <p className="small muted">Anything you say maybe to stays on your week here.</p>}
          </section>
        </aside>
      </div>

      <dialog
        ref={dialogRef}
        id="confirm-reset"
        aria-labelledby="confirm-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="dialog-in">
          <h2 id="confirm-title" style={{ fontSize: 22 }}>Reset this week?</h2>
          <p>Your answers and plan will be cleared.</p>
          <div className="dialog-btns">
            <button type="button" className="btn" id="reset-cancel" autoFocus onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn danger" id="reset-confirm" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
