-- aCcountable: initial schema
-- Every table is per-user and protected by row level security.

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_date date,
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 30 and 300),
  lifestyle text not null default 'light'
    check (lifestyle in ('sedentary', 'light', 'moderate', 'active')),
  goal text not null default 'maintain' check (goal in ('lose', 'maintain', 'gain')),
  goal_rate_kg_per_week numeric(3, 2) not null default 0.5
    check (goal_rate_kg_per_week between 0 and 1.5),
  protein_g_per_kg numeric(3, 1) not null default 1.8
    check (protein_g_per_kg between 0.5 and 4),
  fat_pct numeric(4, 1) not null default 25 check (fat_pct between 10 and 60),
  training_eat_back_pct integer not null default 100
    check (training_eat_back_pct between 0 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

-- Create a profile row automatically when someone signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ───────────────────────── training sessions ─────────────────────────
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  activity text not null check (
    activity in ('run', 'cycle', 'swim', 'strength', 'hiit', 'row', 'sport', 'walk', 'yoga', 'other')
  ),
  duration_min integer not null check (duration_min between 1 and 1440),
  intensity text not null default 'moderate' check (intensity in ('easy', 'moderate', 'hard')),
  -- Optional manual burn (e.g. watch "active calories"); overrides the MET estimate.
  kcal_override integer check (kcal_override between 0 and 10000),
  notes text,
  created_at timestamptz not null default now()
);

create index training_sessions_user_date on public.training_sessions (user_id, date);

alter table public.training_sessions enable row level security;

create policy "training: read own" on public.training_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "training: insert own" on public.training_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "training: update own" on public.training_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "training: delete own" on public.training_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ───────────────────────── food log ─────────────────────────
create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) between 1 and 200),
  serving text,
  kcal integer not null check (kcal between 0 and 20000),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  source text not null default 'manual' check (source in ('manual', 'photo')),
  ai_confidence text check (ai_confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create index food_entries_user_date on public.food_entries (user_id, date);

alter table public.food_entries enable row level security;

create policy "food: read own" on public.food_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "food: insert own" on public.food_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "food: update own" on public.food_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "food: delete own" on public.food_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ───────────────────────── AI scan usage ─────────────────────────
-- One row per photo analysis; used for a daily cap and for cost visibility.
create table public.ai_scans (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_scans_user_created on public.ai_scans (user_id, created_at);

alter table public.ai_scans enable row level security;

create policy "ai_scans: read own" on public.ai_scans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_scans: insert own" on public.ai_scans
  for insert to authenticated with check ((select auth.uid()) = user_id);
