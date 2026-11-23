-- When a session starts (local time), so meals can be timed around training.
alter table public.training_sessions add column start_time time;
