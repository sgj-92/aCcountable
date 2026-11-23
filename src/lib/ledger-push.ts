/** Sends a day to Ledger through the ledger-sync function (which signs it and skips unchanged days). */
import { snapshotKey, type LedgerSnapshot } from './ledger';
import { supabase } from './supabase';

let notConfigured = false;
const lastSent = new Map<string, string>();

/** Fire-and-forget: does nothing once the server says Ledger sync isn't set up. */
export async function pushToLedger(snapshot: LedgerSnapshot): Promise<void> {
  if (notConfigured) return;
  const key = snapshotKey(snapshot);
  if (lastSent.get(snapshot.date) === key) return;
  const { data, error } = await supabase.functions.invoke<{ configured: boolean; sent: boolean }>('ledger-sync', {
    body: { action: 'push', snapshot },
  });
  if (error) return; // Ledger unreachable or not deployed yet: try again on the next change.
  if (data && !data.configured) {
    notConfigured = true;
    return;
  }
  lastSent.set(snapshot.date, key);
}

export async function ledgerSyncStatus(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ configured: boolean }>('ledger-sync', { body: { action: 'status' } });
  return !error && !!data?.configured;
}
