"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadWeekState, saveChanges } from "@/lib/weeks/data";
import { diffStates, isDecided, noChanges } from "@/lib/weeks/state";
import type { WeekEvent, WeekInfo, WeekState } from "@/lib/weeks/types";
import DecidedWeek from "./DecidedWeek";
import ReviewWeek from "./ReviewWeek";
import SkippedWeek from "./SkippedWeek";

type Props = { week: WeekInfo; events: WeekEvent[]; checkedAt: string | null; userId: string; initial: WeekState };

export type WeekActions = {
  change: (update: (s: WeekState) => WeekState) => void;
  leave: () => void;
  edit: () => void;
  stopEditing: () => void;
};

export default function WeekView({ week, events, checkedAt, userId, initial }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);

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

  const change = useCallback(
    (update: (s: WeekState) => WeekState) => {
      latest.current = update(latest.current);
      setState(latest.current);
      flush();
    },
    [flush],
  );

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
        setState(fresh);
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
    leave: async () => {
      await flush();
      router.push("/");
    },
    edit: () => {
      setEditing(true);
      window.scrollTo({ top: 0 });
    },
    stopEditing: () => {
      setEditing(false);
      window.scrollTo({ top: 0 });
    },
  };

  const props = { week, events, checkedAt, state, actions };
  return (
    <>
      {state.skipped ? <SkippedWeek {...props} /> : isDecided(state) && !editing ? <DecidedWeek {...props} /> : <ReviewWeek {...props} />}
      {failed && (
        <div className="fail" role="status">
          Your last change didn&apos;t save. It will keep trying while this page is open.
        </div>
      )}
    </>
  );
}
