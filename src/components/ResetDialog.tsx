"use client";

import type { RefObject } from "react";
import { hasPassed } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";

type Props = { dialogRef: RefObject<HTMLDialogElement | null>; week: WeekInfo; events: WeekEvent[]; state: WeekState; today: string; onReset: () => void };

// Reset leaves days that have passed alone, so the confirmation only counts the rest.
export default function ResetDialog({ dialogRef, week, events, state, today, onReset }: Props) {
  const started = week.days.some((d) => hasPassed(d, today));
  const booked = events.filter((e) => state.plan[e.id]?.booking === "booked" && !hasPassed(e.date, today)).length;
  const text = [
    `Your answers and plan${started ? " from today on" : ""} will be cleared${booked ? `, including ${booked} booked. This doesn't cancel any tickets.` : "."}`,
    started && "Earlier days stay as they are.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
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
        <p id="reset-text">{text}</p>
        <div className="dialog-btns">
          <button type="button" className="btn" id="reset-cancel" autoFocus onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            id="reset-confirm"
            onClick={() => {
              dialogRef.current?.close();
              onReset();
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </dialog>
  );
}
