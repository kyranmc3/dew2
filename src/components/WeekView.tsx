"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadWeekState, saveChanges } from "@/lib/weeks/data";
import { merge, settleDays, weekView } from "@/lib/weeks/days";
import { diffStates, isDecided, isPast, noChanges, resetWeek } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";
import DecidedWeek from "./DecidedWeek";
import ReviewWeek from "./ReviewWeek";
import SkippedWeek from "./SkippedWeek";

// `events` is the whole week, and `initial` holds every choice in it. The screens only see
// the days this user is shown.
type Props = { week: WeekInfo; events: WeekEvent[]; today: string; userId: string; initial: WeekState; weekdays: number[] };

export type WeekActions = {
  change: (update: (s: WeekState) => WeekState) => void;
  reset: () => void;
  leave: () => void;
  edit: () => void;
  reviewFrom: (eventId: string) => void;
  stopEditing: () => void;
};

export default function WeekView({ week, events, today, userId, initial, weekdays }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [full, setFull] = useState(initial);
  const viewOf = useCallback((s: WeekState) => weekView(week.start, events, s, weekdays, today), [events, today, week.start, weekdays]);
  const view = viewOf(full);
  const state = view.state;
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const readOnly = isPast(week.start, today);

  // Set when opening the review at a particular event, used once it has rendered.
  const scrollTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!editing || !scrollTarget.current) return;
    document.getElementById(`event-${scrollTarget.current}`)?.scrollIntoView({ block: "start" });
    scrollTarget.current = null;
  }, [editing]);

  // The screen updates at once and the database catches up, one write at a time.
  // Rapid clicks collapse into the latest state.
  const latest = useRef(initial);
  const persisted = useRef(initial);
  const writing = useRef<Promise<void> | null>(null);

  const pending = useCallback(() => !noChanges(diffStates(persisted.current, latest.current)), []);

  const flush = useCallback(() => {
    writing.current ??= (async () => {
      try {
        while (pending()) {
          const target = latest.current;
          await saveChanges(supabase, userId, week.start, persisted.current, target);
          persisted.current = target;
        }
        setFailed(false);
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    })().finally(() => {
      writing.current = null;
    });
    return writing.current;
  }, [pending, supabase, userId, week.start]);

  // Changes are made on what's on screen, then put back with the hidden choices. Settling
  // or unsettling the week also records which days it keeps.
  const apply = useCallback(
    (next: (before: WeekState, shown: ReturnType<typeof viewOf>) => WeekState) => {
      const before = latest.current;
      const shown = viewOf(before);
      latest.current = settleDays(before, next(before, shown), shown.days, today);
      setFull(latest.current);
      flush();
    },
    [flush, today, viewOf],
  );
  const change = useCallback(
    (update: (s: WeekState) => WeekState) => apply((before, shown) => merge(before, update(shown.state), shown.ids)),
    [apply],
  );
  // Reset also clears choices on hidden days, except days that have passed.
  const reset = useCallback(() => apply((before) => resetWeek(before, events, today)), [apply, events, today]);

  useEffect(() => {
    if (!failed) return;
    const retry = setTimeout(flush, 5000);
    return () => clearTimeout(retry);
  }, [failed, flush]);

  // Picks up changes from another device, and replaces what the router may have
  // cached when this page was reached with the back button.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible" || pending() || writing.current) return;
      const before = latest.current;
      try {
        const fresh = await loadWeekState(supabase, week.start, events.map((e) => e.id));
        if (latest.current !== before || writing.current) return;
        latest.current = fresh;
        persisted.current = fresh;
        setFull(fresh);
      } catch (error) {
        console.error(error);
      }
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [events, pending, supabase, week.start]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const actions: WeekActions = {
    change,
    reset,
    leave: async () => {
      await flush();
      router.push(readOnly ? "/past-weeks" : "/");
    },
    edit: () => {
      setEditing(true);
      window.scrollTo({ top: 0 });
    },
    reviewFrom: (eventId) => {
      scrollTarget.current = eventId;
      setEditing(true);
    },
    stopEditing: () => {
      setEditing(false);
      window.scrollTo({ top: 0 });
    },
  };

  const props = { week: { ...week, days: view.days }, events: view.events, state, actions, today };
  return (
    <>
      {state.skipped ? (
        <SkippedWeek {...props} readOnly={readOnly} />
      ) : readOnly || (isDecided(state) && !editing) ? (
        <DecidedWeek {...props} readOnly={readOnly} preferencesChanged={view.preferencesChanged} />
      ) : (
        <ReviewWeek {...props} />
      )}
      {failed && (
        <div className="fail" role="status">
          Your last change didn&apos;t save. It will keep trying while this page is open.
        </div>
      )}
    </>
  );
}
