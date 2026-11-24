-- When the weigh-in correction last adjusted maintenance by itself (it steps at most once a week).
alter table public.profiles add column if not exists maintenance_adjusted_on date;

-- How Today names meals: numbered meals (Meal 1, Meal 2…) or just the time they were eaten.
alter table public.profiles add column if not exists meal_mode text not null default 'meals'
  check (meal_mode in ('meals', 'time'));

-- When a food was eaten, in minutes after midnight (null: when it was logged).
alter table public.food_entries add column if not exists eaten_at smallint
  check (eaten_at between 0 and 1439);
