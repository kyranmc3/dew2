import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import WeekView from "@/components/WeekView";
import { createClient } from "@/lib/supabase/server";
import { weekDates, weekView } from "@/lib/weeks/days";
import { loadEvents, loadWeek, loadWeekdays, loadWeekState, visibleEvents } from "@/lib/weeks/data";
import { todayInNewYork, weekLabel } from "@/lib/weeks/format";

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export async function generateMetadata({ params }: PageProps<"/weeks/[start]">): Promise<Metadata> {
  const { start } = await params;
  return { title: isDate(start) ? `${weekLabel(start)} · dew` : "dew" };
}

export default async function WeekPage({ params }: PageProps<"/weeks/[start]">) {
  const { start } = await params;
  if (!isDate(start)) notFound();

  const supabase = await createClient();
  const week = await loadWeek(supabase, start);
  if (!week) notFound();
  if (!week.isReady) redirect("/");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The whole week is loaded, because Reset or Settings can change which days show.
  const all = await loadEvents(supabase, start, weekDates(start)[6]);
  const { data: plan } = await supabase.from("plan_entries").select("event_id").in("event_id", all.map((e) => e.id));
  const events = visibleEvents(all, plan ?? []);
  const [initial, weekdays] = await Promise.all([loadWeekState(supabase, start, events.map((e) => e.id)), loadWeekdays(supabase)]);
  const today = todayInNewYork();
  // A week with nothing on this user's days isn't ready for them.
  if (!weekView(start, events, initial, weekdays, today).events.length) redirect("/");

  return <WeekView week={week} events={events} today={today} userId={user.id} initial={initial} weekdays={weekdays} />;
}
