-- Sessions remember the exact WHOOP activity they were picked as ("Running",
-- "Functional Fitness"), so estimates use that activity's own history and
-- WHOOP re-imports confirm the right session.
alter table public.training_sessions
  add column whoop_activity text check (char_length(whoop_activity) <= 80);
