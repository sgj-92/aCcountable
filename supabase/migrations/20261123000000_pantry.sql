-- The pantry: foods someone eats as part of their diet, with nutrition per
-- 100 g, the portion they usually have, and the meals they usually have it at.
-- Used for one-tap logging and for building meal plans without the AI.
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  kcal_100g numeric(6, 1) not null check (kcal_100g between 0 and 950),
  protein_100g numeric(5, 1) not null default 0 check (protein_100g between 0 and 100),
  carbs_100g numeric(5, 1) not null default 0 check (carbs_100g between 0 and 100),
  fat_100g numeric(5, 1) not null default 0 check (fat_100g between 0 and 100),
  -- The usual portion in grams; for countable foods also the unit and its weight.
  portion_g numeric(6, 1) not null check (portion_g > 0 and portion_g <= 5000),
  unit_name text check (char_length(unit_name) <= 40),
  unit_g numeric(6, 1) check (unit_g > 0),
  -- Meal keys this food is usually eaten at (empty = any time).
  meals text[] not null default '{}'
    check (meals <@ array['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']::text[]),
  source text not null default 'manual' check (source in ('ai', 'usda', 'off', 'manual')),
  source_ref text check (char_length(source_ref) <= 64),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.pantry_items enable row level security;
create policy "pantry: read own" on public.pantry_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "pantry: insert own" on public.pantry_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pantry: update own" on public.pantry_items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pantry: delete own" on public.pantry_items
  for delete to authenticated using ((select auth.uid()) = user_id);
