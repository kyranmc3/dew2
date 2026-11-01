-- The catalog (events, weeks) comes from Notion through the sync script. Everyone
-- signed in can read it, and only the script can write it. Everything else belongs
-- to one user, and row-level security keeps it to that user.

create table public.events (
  id text primary key, -- the Notion page ID
  name text not null,
  source text,
  type text,
  format text,
  featuring text,
  venue text,
  neighborhood text,
  event_date date not null,
  start_time time,
  end_time time,
  price numeric(8, 2),
  availability text,
  link text,
  description text,
  poster_path text, -- in the posters bucket
  poster_source text, -- which Notion file was copied, so an unchanged poster isn't copied again
  is_active boolean not null default true, -- false once the event has left Notion
  synced_at timestamptz not null default now() -- also when price and availability were last checked
);
create index events_event_date_idx on public.events (event_date);

create table public.weeks (
  start_date date primary key check (extract(isodow from start_date) = 1),
  days date[] not null,
  is_ready boolean not null default false,
  day_notes jsonb not null default '{}'::jsonb
);

create table public.week_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null references public.weeks (start_date),
  is_saved boolean not null default false,
  is_skipped boolean not null default false,
  primary key (user_id, week_start)
);
create index week_states_week_start_idx on public.week_states (week_start);

create table public.responses (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null references public.events (id),
  answer text not null check (answer in ('no', 'maybe', 'yes')),
  shortlist_rank integer check (shortlist_rank is null or answer = 'yes'),
  primary key (user_id, event_id)
);
create index responses_event_id_idx on public.responses (event_id);

-- A row means the event is committed. A null booking means Not booked.
create table public.plan_entries (
  user_id uuid not null,
  event_id text not null,
  booking text check (booking in ('booked', 'waitlist')),
  primary key (user_id, event_id),
  foreign key (user_id, event_id) references public.responses (user_id, event_id) on delete cascade
);

-- Append-only history for a future taste profile. Filled by triggers, so resetting a
-- week or changing an answer can't erase it. user_id has no foreign key because a
-- deleted user's rows are removed first, and those removals are logged too.
create table public.response_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event_id text not null references public.events (id),
  kind text not null check (kind in ('answer', 'rank', 'commit', 'booking')),
  value text, -- null means cleared
  logged_at timestamptz not null default now()
);
create index response_log_user_id_idx on public.response_log (user_id, logged_at);
create index response_log_event_id_idx on public.response_log (event_id);

create function public.log_response_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.response_log (user_id, event_id, kind, value)
    values (old.user_id, old.event_id, 'answer', null);
    return old;
  end if;
  if tg_op = 'INSERT' or new.answer is distinct from old.answer then
    insert into public.response_log (user_id, event_id, kind, value)
    values (new.user_id, new.event_id, 'answer', new.answer);
  end if;
  if (tg_op = 'INSERT' and new.shortlist_rank is not null)
    or (tg_op = 'UPDATE' and new.shortlist_rank is distinct from old.shortlist_rank) then
    insert into public.response_log (user_id, event_id, kind, value)
    values (new.user_id, new.event_id, 'rank', new.shortlist_rank::text);
  end if;
  return new;
end;
$$;

create function public.log_plan_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.response_log (user_id, event_id, kind, value)
    values (old.user_id, old.event_id, 'commit', null);
    return old;
  end if;
  if tg_op = 'INSERT' then
    insert into public.response_log (user_id, event_id, kind, value)
    values (new.user_id, new.event_id, 'commit', 'committed');
  end if;
  if (tg_op = 'INSERT' and new.booking is not null)
    or (tg_op = 'UPDATE' and new.booking is distinct from old.booking) then
    insert into public.response_log (user_id, event_id, kind, value)
    values (new.user_id, new.event_id, 'booking', new.booking);
  end if;
  return new;
end;
$$;

revoke execute on function public.log_response_change() from public, anon, authenticated;
revoke execute on function public.log_plan_change() from public, anon, authenticated;

create trigger responses_log after insert or update or delete on public.responses
  for each row execute function public.log_response_change();
create trigger plan_entries_log after insert or update or delete on public.plan_entries
  for each row execute function public.log_plan_change();

-- Row-level security
alter table public.events enable row level security;
alter table public.weeks enable row level security;
alter table public.week_states enable row level security;
alter table public.responses enable row level security;
alter table public.plan_entries enable row level security;
alter table public.response_log enable row level security;

revoke all on public.events, public.weeks, public.week_states, public.responses, public.plan_entries, public.response_log from anon, authenticated;
grant select on public.events, public.weeks, public.response_log to authenticated;
grant select, insert, update, delete on public.week_states, public.responses, public.plan_entries to authenticated;

create policy "Signed-in users read events" on public.events for select to authenticated using (true);
create policy "Signed-in users read weeks" on public.weeks for select to authenticated using (true);
create policy "Users read their own log" on public.response_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users manage their own week states" on public.week_states for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their own responses" on public.responses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their own plan" on public.plan_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Posters are public images, served by URL. Only the sync script can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

-- Weeks start out not ready, and running the sync for a week marks it ready.
insert into public.weeks (start_date, days, day_notes) values
  ('2026-11-02', '{2026-11-03,2026-11-04,2026-11-05}', '{}'),
  ('2026-11-09', '{2026-11-10,2026-11-11,2026-11-12}', '{}'),
  ('2026-11-16', '{2026-11-17,2026-11-18,2026-11-19}', '{}'),
  ('2026-11-23', '{2026-11-24,2026-11-25,2026-11-26}', '{"2026-11-26": "Thanksgiving. Nothing is listed for this night."}'),
  ('2026-11-30', '{2026-12-01,2026-12-02,2026-12-03}', '{}'),
  ('2026-12-07', '{2026-12-08,2026-12-09,2026-12-10}', '{}'),
  ('2026-12-14', '{2026-12-15,2026-12-16,2026-12-17}', '{}');
