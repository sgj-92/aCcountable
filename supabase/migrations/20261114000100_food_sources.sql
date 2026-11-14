-- Weighed foods from USDA FoodData Central and Open Food Facts.

alter table public.food_entries
  -- Weight eaten, so a logged food can be re-scaled and re-logged by grams.
  add column grams numeric(7, 1) check (grams > 0 and grams <= 10000),
  -- USDA fdcId or Open Food Facts barcode the values came from.
  add column source_ref text check (char_length(source_ref) <= 64);

alter table public.food_entries drop constraint food_entries_source_check;
alter table public.food_entries add constraint food_entries_source_check
  check (source in ('manual', 'photo', 'usda', 'off'));
