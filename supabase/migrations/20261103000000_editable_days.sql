-- Editable days. Each user picks the weekdays dew plans around, and a week that's settled
-- (saved with a plan, or skipped) keeps the days it was settled with.

-- Weekdays are numbered as in JavaScript's getUTCDay, so 0 is Sunday. No row means
-- Tuesday to Thursday.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weekdays smallint[] not null check (cardinality(weekdays) > 0 and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;
create policy "Users manage their own settings" on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The days a week shows. A settled week shows exactly these. An unsettled week keeps these
-- only for days that have passed, and follows Settings from today on. Null means Settings.
alter table public.week_states add column days date[];

-- Every week settled so far was settled on Tuesday to Thursday.
update public.week_states
set days = array[week_start + 1, week_start + 2, week_start + 3]
where is_saved or is_skipped;
