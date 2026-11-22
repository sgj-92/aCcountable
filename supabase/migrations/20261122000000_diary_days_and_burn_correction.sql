-- Diary-only days: food is still logged (with or without calories), but the
-- day is left out of the week balance and the weight-based burn estimate.
create table public.diary_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.diary_days enable row level security;
create policy "diary_days: read own" on public.diary_days
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "diary_days: insert own" on public.diary_days
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "diary_days: delete own" on public.diary_days
  for delete to authenticated using ((select auth.uid()) = user_id);

-- A correction to the estimated maintenance calories, accepted by the person
-- from the weight-trend burn estimate (MacroFactor-style). 0 = formula only.
alter table public.profiles
  add column maintenance_adjust_kcal integer not null default 0
    check (maintenance_adjust_kcal between -1500 and 1500);
