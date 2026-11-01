import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadSources } from "@/lib/weeks/data";

export const metadata: Metadata = { title: "Settings · dew" };

const DAYS = [
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday", on: true },
  { short: "W", full: "Wednesday", on: true },
  { short: "Th", full: "Thursday", on: true },
  { short: "F", full: "Friday" },
  { short: "Sa", full: "Saturday" },
  { short: "Su", full: "Sunday" },
];

export default async function SettingsPage() {
  const sources = await loadSources(await createClient());
  return (
    <div className="wrap page" style={{ gap: 26 }}>
      <p className="notice" id="settings-locked" role="note">
        Settings are locked for v1. You can view your days and sources, but can&apos;t change them yet.
      </p>
      <Link className="link" href="/">← All weeks</Link>
      <h1 className="page-title" style={{ fontSize: 40 }}>Settings</h1>
      <section className="section" id="settings-days">
        <h2 style={{ fontSize: 24 }}>Days</h2>
        <ul className="pills" aria-label="Days">
          {DAYS.map((d) => (
            <li key={d.full} className={d.on ? "on" : ""} aria-label={`${d.full}, ${d.on ? "selected" : "not selected"}`}>
              {d.short}
            </li>
          ))}
        </ul>
      </section>
      <section className="section" id="settings-sources">
        <h2 style={{ fontSize: 24 }}>Sources</h2>
        <ul className="pills" aria-label="Sources">
          {sources.map((s) => (
            <li key={s} className="on" aria-label={`${s}, selected`}>
              {s}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
