-- Custom meal names (up to six meals) and an intermittent-fasting eating window.

alter table public.profiles
  -- [{ "key": "breakfast", "label": "Meal 1" }, ...] in display order; null = classic set.
  add column meal_slots jsonb
    check (
      meal_slots is null
      or (jsonb_typeof(meal_slots) = 'array' and jsonb_array_length(meal_slots) between 1 and 6)
    ),
  -- Eating window as clock times; both null = not fasting. May cross midnight.
  add column eating_window_start time,
  add column eating_window_end time,
  add constraint profiles_eating_window_both
    check ((eating_window_start is null) = (eating_window_end is null));

-- Two more meal slots for people who eat five or six times a day.
alter table public.food_entries drop constraint food_entries_meal_check;
alter table public.food_entries add constraint food_entries_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'));

alter table public.plan_items drop constraint plan_items_meal_check;
alter table public.plan_items add constraint plan_items_meal_check
  check (meal in ('breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'));
