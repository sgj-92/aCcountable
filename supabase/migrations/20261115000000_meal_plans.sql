-- Daily meal plans: the foods someone intends to eat, with nutrition per 100 g
-- and a realistic portion range. The app's solver turns these into gram
-- amounts that hit the day's targets; amounts aren't stored because they're
-- recalculated as food gets logged.

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  position integer not null default 0,
  name text not null check (char_length(name) between 1 and 200),
  kcal_100g numeric(6, 1) not null check (kcal_100g between 0 and 950),
  protein_100g numeric(5, 1) not null default 0 check (protein_100g between 0 and 100),
  carbs_100g numeric(5, 1) not null default 0 check (carbs_100g between 0 and 100),
  fat_100g numeric(5, 1) not null default 0 check (fat_100g between 0 and 100),
  min_g numeric(6, 1) not null check (min_g >= 0),
  typical_g numeric(6, 1) not null,
  max_g numeric(6, 1) not null check (max_g <= 5000),
  -- Countable foods (eggs, slices): amounts are planned in whole units.
  unit_name text check (char_length(unit_name) <= 40),
  unit_g numeric(6, 1) check (unit_g > 0),
  -- An amount the person has fixed; the solver plans the rest around it.
  fixed_g numeric(6, 1) check (fixed_g >= 0),
  source text not null default 'ai' check (source in ('ai', 'usda', 'off', 'manual')),
  source_ref text check (char_length(source_ref) <= 64),
  -- Set once the item has been eaten and logged; deleting the log entry un-logs it.
  logged_entry_id uuid references public.food_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  check (min_g <= typical_g and typical_g <= max_g)
);

create index plan_items_user_date on public.plan_items (user_id, date);

alter table public.plan_items enable row level security;

create policy "plan: read own" on public.plan_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "plan: insert own" on public.plan_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "plan: update own" on public.plan_items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "plan: delete own" on public.plan_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Planning calls Claude too; record which feature each AI call was for.
alter table public.ai_scans
  add column kind text not null default 'photo' check (kind in ('photo', 'plan'));
