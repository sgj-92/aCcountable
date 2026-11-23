-- Day types: presets agreed with a coach ("Rest day", "Padel day"), each with
-- the day's calorie and macro targets, the training it assumes, and the meals
-- (foods and set portions) that make up the day.
create table public.day_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  kcal integer not null check (kcal between 800 and 8000),
  protein_g integer not null check (protein_g between 0 and 600),
  carbs_g integer not null check (carbs_g between 0 and 1200),
  fat_g integer not null check (fat_g between 0 and 400),
  -- Assumed training: [{ activity, whoop_activity, duration_min, intensity }]
  sessions jsonb not null default '[]' check (jsonb_typeof(sessions) = 'array'),
  -- Meals: [{ meal, name, grams, kcal_100g, protein_100g, carbs_100g, fat_100g,
  --           unit_name, unit_g, pantry_id, source, source_ref }]
  meals jsonb not null default '[]' check (jsonb_typeof(meals) = 'array'),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.day_types enable row level security;
create policy "day_types: read own" on public.day_types
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "day_types: insert own" on public.day_types
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "day_types: update own" on public.day_types
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "day_types: delete own" on public.day_types
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Which day type each date follows.
create table public.day_assignments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  day_type_id uuid not null references public.day_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.day_assignments enable row level security;
create policy "day_assignments: read own" on public.day_assignments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "day_assignments: insert own" on public.day_assignments
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "day_assignments: update own" on public.day_assignments
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "day_assignments: delete own" on public.day_assignments
  for delete to authenticated using ((select auth.uid()) = user_id);
