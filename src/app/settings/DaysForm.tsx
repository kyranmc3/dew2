"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Weekdays are numbered as in getUTCDay, so 0 is Sunday.
const DAYS = [
  { n: 1, short: "M", full: "Monday" },
  { n: 2, short: "T", full: "Tuesday" },
  { n: 3, short: "W", full: "Wednesday" },
  { n: 4, short: "Th", full: "Thursday" },
  { n: 5, short: "F", full: "Friday" },
  { n: 6, short: "Sa", full: "Saturday" },
  { n: 0, short: "Su", full: "Sunday" },
];

const same = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join();

type Props = {
  userId: string;
  initial: number[];
  // The first week that would pick up new days, like "the week of Dec 7".
  appliesFrom: string | null;
  // The current week's days so far, saved before a change so its passed days stay put.
  keepCurrentWeek: { week_start: string; is_saved: boolean; is_skipped: boolean; days: string[] } | null;
};

export default function DaysForm({ userId, initial, appliesFrom, keepCurrentWeek }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [days, setDays] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (n: number) => {
    if (days.includes(n) && days.length === 1) {
      setMessage("Keep at least one day.");
      return;
    }
    setMessage(null);
    setDays(days.includes(n) ? days.filter((d) => d !== n) : [...days, n]);
  };

  const save = async () => {
    setBusy(true);
    const supabase = createClient();
    try {
      if (keepCurrentWeek) {
        const { error } = await supabase.from("week_states").upsert({ user_id: userId, ...keepCurrentWeek });
        if (error) throw error;
      }
      const weekdays = [...days].sort();
      const { error } = await supabase.from("user_settings").upsert({ user_id: userId, weekdays, updated_at: new Date().toISOString() });
      if (error) throw error;
      setSaved(weekdays);
      setMessage(appliesFrom ? `Saved. Your new days apply from ${appliesFrom}.` : "Saved.");
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ul className="pills" aria-label="Days">
        {DAYS.map((d) => {
          const on = days.includes(d.n);
          return (
            <li key={d.n} className={on ? "on" : ""}>
              <button type="button" aria-pressed={on} aria-label={d.full} onClick={() => toggle(d.n)}>
                {d.short}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>Weeks with a plan keep their days.</p>
      {!same(days, saved) && (
        <button type="button" className="btn" id="save-days" disabled={busy} onClick={save} style={{ width: "fit-content" }}>
          Save
        </button>
      )}
      {message && (
        <p className="small" id="days-message" role="status" style={{ margin: 0, fontWeight: 700 }}>
          {message}
        </p>
      )}
    </>
  );
}
