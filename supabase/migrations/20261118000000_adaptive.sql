-- Adapting to the day: confirmed session burns, racket sports, weigh-ins and
-- WHOOP workout history.

-- Padel and tennis as activities.
alter table public.training_sessions drop constraint training_sessions_activity_check;
alter table public.training_sessions add constraint training_sessions_activity_check check (
  activity in ('run', 'cycle', 'swim', 'strength', 'hiit', 'row', 'sport', 'padel', 'tennis', 'walk', 'yoga', 'other')
);

-- What actually happened: total calories as WHOOP shows them, and the real duration.
alter table public.training_sessions
  add column actual_kcal integer check (actual_kcal between 0 and 10000),
  add column actual_duration_min integer check (actual_duration_min between 1 and 1440);

-- Weigh-ins (one per day; logging again replaces that day's value).
create table public.weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.weigh_ins enable row level security;
create policy "weigh_ins: read own" on public.weigh_ins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "weigh_ins: insert own" on public.weigh_ins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "weigh_ins: update own" on public.weigh_ins
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "weigh_ins: delete own" on public.weigh_ins
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Workouts imported from a WHOOP data export; the source of personal burn rates.
create table public.whoop_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at timestamp not null, -- local time, as WHOOP exports it
  date date not null,
  activity_name text not null check (char_length(activity_name) <= 80),
  activity text not null check (
    activity in ('run', 'cycle', 'swim', 'strength', 'hiit', 'row', 'sport', 'padel', 'tennis', 'walk', 'yoga', 'other')
  ),
  duration_min numeric(6, 1) not null check (duration_min > 0 and duration_min <= 1440),
  kcal integer not null check (kcal between 0 and 20000),
  strain numeric(4, 1),
  avg_hr integer,
  created_at timestamptz not null default now(),
  unique (user_id, started_at)
);

create index whoop_workouts_user_date on public.whoop_workouts (user_id, date);

alter table public.whoop_workouts enable row level security;
create policy "whoop: read own" on public.whoop_workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "whoop: insert own" on public.whoop_workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "whoop: update own" on public.whoop_workouts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "whoop: delete own" on public.whoop_workouts
  for delete to authenticated using ((select auth.uid()) = user_id);
