-- Two-way sync with Ledger (Shaun's day-planning app). See docs/ledger-sync.md.

-- Sessions that came from Ledger keep Ledger's reference, so later changes update the
-- same session instead of adding another.
alter table public.training_sessions add column external_ref text check (char_length(external_ref) <= 120);
create unique index training_sessions_external_ref on public.training_sessions (user_id, external_ref)
  where external_ref is not null;

-- What was last sent to and received from Ledger for each day: lets the sync skip
-- unchanged days, and maps a meal ticked done in Ledger back to the planned foods
-- (and amounts) that were sent for it. Written only by the ledger-sync function.
create table public.ledger_sync_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  last_sent jsonb,
  last_received jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.ledger_sync_state enable row level security;
create policy "ledger_sync_state: read own" on public.ledger_sync_state
  for select to authenticated using ((select auth.uid()) = user_id);
