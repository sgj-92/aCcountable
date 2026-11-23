// Supabase Edge Function: two-way sync with Ledger. See docs/ledger-sync.md.
//
// From the app (signed in): { action: "status" } or { action: "push", snapshot } —
//   forwards the day's snapshot to Ledger, signed, unless it hasn't changed.
// From Ledger (x-sync-timestamp + x-sync-signature, HMAC-SHA256 of "<ts>.<body>"):
//   one day of Ledger's training, meals ticked done and weight; applies only differences.
//
// Secrets: LEDGER_SYNC_SECRET (shared with Ledger), LEDGER_SYNC_URL (Ledger's endpoint).
// Optional: LEDGER_USER_ID (the aCcountable user Ledger's days belong to; otherwise the
// user who last pushed).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isInbound, latestTrend, planInbound, sign, verify, type Session, type SentMeal } from './logic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const SECRET = Deno.env.get('LEDGER_SYNC_SECRET') ?? '';
const LEDGER_URL = Deno.env.get('LEDGER_SYNC_URL') ?? '';
const configured = () => SECRET.length >= 16 && /^https:\/\//.test(LEDGER_URL);

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const SESSION_COLS = 'id,date,activity,duration_min,actual_duration_min,actual_kcal,start_time,external_ref';

function amount(unitName: string | null, unitG: number | null, grams: number) {
  const g = Math.round(grams * 10) / 10;
  if (unitName && unitG) {
    const n = Math.round((grams / unitG) * 10) / 10;
    return `${n} ${n === 1 ? unitName : `${unitName}s`} · ${g} g`;
  }
  return `${g} g`;
}

// ───────────── from Ledger ─────────────

async function fromLedger(raw: string, req: Request) {
  const ok = await verify(SECRET, req.headers.get('x-sync-timestamp'), req.headers.get('x-sync-signature'), raw);
  if (!ok) return json({ error: 'Bad signature' }, 401);
  let inbound: unknown;
  try {
    inbound = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!isInbound(inbound)) return json({ error: 'Expected { v: 1, origin: "ledger", date, training, mealsDone, weightKg }' }, 400);

  const db = admin();
  const userId = Deno.env.get('LEDGER_USER_ID') || (await ownerFromState(db));
  if (!userId) return json({ error: 'aCcountable hasn’t synced with Ledger yet: open aCcountable once.' }, 409);
  const date = inbound.date;

  const [sessionsRes, weighRes, stateRes] = await Promise.all([
    db.from('training_sessions').select(SESSION_COLS).eq('user_id', userId).eq('date', date),
    db.from('weigh_ins').select('weight_kg').eq('user_id', userId).eq('date', date).maybeSingle(),
    db.from('ledger_sync_state').select('last_sent').eq('user_id', userId).eq('date', date).maybeSingle(),
  ]);
  if (sessionsRes.error) return json({ error: sessionsRes.error.message }, 500);
  const sentMeals = ((stateRes.data?.last_sent as { meals?: SentMeal[] } | null)?.meals ?? []) as SentMeal[];
  const changes = planInbound(
    inbound,
    (sessionsRes.data ?? []) as Session[],
    weighRes.data ? Number(weighRes.data.weight_kg) : null,
    sentMeals,
  );

  for (const s of changes.insert) {
    const r = await db.from('training_sessions').insert({
      user_id: userId,
      date,
      activity: s.activity,
      duration_min: s.duration_min,
      intensity: 'moderate',
      start_time: s.start_time,
      external_ref: s.external_ref,
      notes: 'From Ledger',
    });
    if (r.error) console.error('insert session', r.error.message);
  }
  for (const u of changes.update) {
    const r = await db.from('training_sessions').update(u.patch).eq('user_id', userId).eq('id', u.id);
    if (r.error) console.error('update session', r.error.message);
  }
  if (changes.remove.length) {
    const r = await db.from('training_sessions').delete().eq('user_id', userId).in('id', changes.remove);
    if (r.error) console.error('remove sessions', r.error.message);
  }

  if (changes.weightKg != null) {
    const r = await db.from('weigh_ins').upsert({ user_id: userId, date, weight_kg: changes.weightKg }, { onConflict: 'user_id,date' });
    if (r.error) console.error('weigh-in', r.error.message);
    // Keep the profile's weight (which drives targets) on the smoothed trend, as the app does.
    const since = new Date(Date.parse(date) - 90 * 86_400_000).toISOString().slice(0, 10);
    const all = await db.from('weigh_ins').select('date,weight_kg').eq('user_id', userId).gte('date', since);
    const trend = latestTrend((all.data ?? []).map((w) => ({ date: w.date, weight_kg: Number(w.weight_kg) })));
    if (trend != null) await db.from('profiles').update({ weight_kg: Math.round(trend * 10) / 10 }).eq('id', userId);
  }

  let logged = 0;
  if (changes.log.length) {
    const ids = changes.log.map((l) => l.planItemId);
    const items = await db.from('plan_items').select('*').eq('user_id', userId).in('id', ids).is('logged_entry_id', null);
    for (const item of items.data ?? []) {
      const grams = changes.log.find((l) => l.planItemId === item.id)!.grams;
      const f = grams / 100;
      const r1 = (n: number) => Math.round(n * 10) / 10;
      const entry = await db
        .from('food_entries')
        .insert({
          user_id: userId,
          date: item.date,
          meal: item.meal,
          name: item.name,
          serving: amount(item.unit_name, item.unit_g == null ? null : Number(item.unit_g), grams),
          kcal: Math.round(Number(item.kcal_100g) * f),
          protein_g: r1(Number(item.protein_100g) * f),
          carbs_g: r1(Number(item.carbs_100g) * f),
          fat_g: r1(Number(item.fat_100g) * f),
          grams: r1(grams),
          source: item.source === 'usda' || item.source === 'off' ? item.source : 'manual',
          source_ref: item.source_ref,
          ai_confidence: null,
        })
        .select('id')
        .single();
      if (entry.error) {
        console.error('log planned food', entry.error.message);
        continue;
      }
      await db.from('plan_items').update({ logged_entry_id: entry.data.id }).eq('id', item.id);
      logged++;
    }
  }

  await db
    .from('ledger_sync_state')
    .upsert({ user_id: userId, date, last_received: inbound, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });

  return json({
    ok: true,
    applied: {
      added: changes.insert.length,
      updated: changes.update.length,
      removed: changes.remove.length,
      weight: changes.weightKg != null,
      logged,
    },
  });
}

async function ownerFromState(db: SupabaseClient): Promise<string | null> {
  const r = await db.from('ledger_sync_state').select('user_id').not('last_sent', 'is', null).order('updated_at', { ascending: false }).limit(1);
  return r.data?.[0]?.user_id ?? null;
}

// ───────────── from the app ─────────────

async function fromApp(raw: string, req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);

  let body: { action?: string; snapshot?: { v?: number; origin?: string; date?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (body.action === 'status') return json({ configured: configured() });
  if (body.action !== 'push') return json({ error: 'Unknown action' }, 400);
  if (!configured()) return json({ configured: false, sent: false });

  const snap = body.snapshot;
  if (!snap || snap.v !== 1 || snap.origin !== 'accountable' || !/^\d{4}-\d{2}-\d{2}$/.test(snap.date ?? '')) {
    return json({ error: 'Invalid snapshot' }, 400);
  }
  const db = admin();
  const prev = await db.from('ledger_sync_state').select('last_sent').eq('user_id', userData.user.id).eq('date', snap.date!).maybeSingle();
  if (prev.data?.last_sent && JSON.stringify(prev.data.last_sent) === JSON.stringify(snap)) {
    return json({ configured: true, sent: false });
  }

  const payload = JSON.stringify(snap);
  const ts = String(Date.now());
  let res: Response;
  try {
    res = await fetch(LEDGER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-timestamp': ts, 'x-sync-signature': `sha256=${await sign(SECRET, ts, payload)}` },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('Ledger unreachable:', e instanceof Error ? e.message : e);
    return json({ configured: true, sent: false, error: 'Ledger unreachable' }, 502);
  }
  if (!res.ok) {
    console.error('Ledger refused:', res.status, await res.text().catch(() => ''));
    return json({ configured: true, sent: false, error: `Ledger returned ${res.status}` }, 502);
  }
  await db
    .from('ledger_sync_state')
    .upsert({ user_id: userData.user.id, date: snap.date, last_sent: snap, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
  return json({ configured: true, sent: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await req.text();
  return req.headers.get('x-sync-signature') ? fromLedger(raw, req) : fromApp(raw, req);
});
