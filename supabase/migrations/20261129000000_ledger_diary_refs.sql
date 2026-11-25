-- Food typed in Ledger is logged once per Ledger ref (food_entries.source_ref = 'ledger:diary:<date>:<id>').
create unique index if not exists food_entries_ledger_diary_ref
  on public.food_entries (user_id, source_ref)
  where source_ref like 'ledger:diary:%';
