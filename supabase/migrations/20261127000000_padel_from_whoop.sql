-- WHOOP calls padel "Paddle Tennis", which was filed as tennis. File it as padel, and give
-- day types built from WHOOP names the app's own names (as in Ledger): "Padel day", "Strength day".

update public.whoop_workouts
set activity = 'padel'
where activity_name ilike '%paddle%' and activity <> 'padel';

update public.training_sessions
set activity = 'padel'
where whoop_activity ilike '%paddle%' and activity <> 'padel';

update public.day_types d
set sessions = (
  select jsonb_agg(
    case when e->>'whoop_activity' ilike '%paddle%' then jsonb_set(e, '{activity}', '"padel"') else e end
    order by i
  )
  from jsonb_array_elements(d.sessions) with ordinality as x(e, i)
)
where d.sessions::text ilike '%paddle%';

-- Rename only the names "Build them for me" made, and only where the new name is free.
update public.day_types d
set name = r.new_name
from (values ('paddle tennis day', 'Padel day'), ('weightlifting day', 'Strength day')) as r(old_name, new_name)
where lower(d.name) = r.old_name
  and not exists (select 1 from public.day_types o where o.user_id = d.user_id and o.name = r.new_name);
