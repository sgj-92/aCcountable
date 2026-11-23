// Pure parts of the Ledger sync: request signing and deciding what an incoming
// day from Ledger changes in aCcountable. See docs/ledger-sync.md.

export type LedgerType = 'padel' | 'resistance' | 'cardio' | 'hiit' | 'yoga';
export type Activity = 'run' | 'cycle' | 'swim' | 'strength' | 'hiit' | 'row' | 'sport' | 'padel' | 'tennis' | 'walk' | 'yoga' | 'other';

const TO_LEDGER: Record<Activity, LedgerType> = {
  padel: 'padel', tennis: 'padel', strength: 'resistance', hiit: 'hiit', yoga: 'yoga',
  run: 'cardio', cycle: 'cardio', swim: 'cardio', row: 'cardio', walk: 'cardio', sport: 'cardio', other: 'cardio',
};
const FROM_LEDGER: Record<LedgerType, Activity> = { padel: 'padel', resistance: 'strength', hiit: 'hiit', yoga: 'yoga', cardio: 'other' };
export const toLedgerType = (a: string): LedgerType => TO_LEDGER[a as Activity] ?? 'cardio';
export const fromLedgerType = (t: string): Activity => FROM_LEDGER[t as LedgerType] ?? 'other';

// ───────────── signing ─────────────

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA256 of "<timestamp>.<body>", hex. */
export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)));
}

/** Checks the signature and that the timestamp is within 5 minutes. */
export async function verify(secret: string, timestamp: string | null, signature: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!secret || !timestamp || !signature) return false;
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(now - t) > 5 * 60 * 1000) return false;
  const expected = await sign(secret, timestamp, body);
  const given = signature.replace(/^sha256=/, '');
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// ───────────── applying a day from Ledger ─────────────

export interface InTraining {
  ref: string;
  type: string;
  title?: string;
  startTime: string | null;
  durationMin: number;
}

export interface Inbound {
  v: 1;
  origin: 'ledger';
  date: string;
  training: InTraining[];
  mealsDone: string[];
  weightKg: number | null;
}

export interface Session {
  id: string;
  date: string;
  activity: string;
  duration_min: number;
  actual_duration_min: number | null;
  actual_kcal: number | null;
  start_time: string | null;
  external_ref: string | null;
}

export interface SentMeal {
  ref: string;
  planned: { planItemId: string; grams: number }[];
}

export interface Changes {
  insert: { activity: Activity; duration_min: number; start_time: string | null; external_ref: string }[];
  update: { id: string; patch: Partial<Pick<Session, 'activity' | 'duration_min' | 'start_time'>> }[];
  remove: string[];
  weightKg: number | null;
  log: { planItemId: string; grams: number }[];
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

const isInbound = (x: unknown): x is Inbound => {
  const o = x as Inbound;
  return !!o && o.v === 1 && o.origin === 'ledger' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) && Array.isArray(o.training) && Array.isArray(o.mealsDone);
};
export { isInbound };

/**
 * What an incoming day from Ledger changes. Only differences produce changes, so the
 * echo of what aCcountable just sent changes nothing.
 * - Ledger's own sessions ("ledger:…") are added, updated, or removed when Ledger drops them
 *   (unless their burn was confirmed).
 * - aCcountable's sessions ("acc:session:<id>") get Ledger's edits to time, length and type;
 *   they are never deleted from Ledger.
 * - A weight that differs from the day's weigh-in is recorded.
 * - A meal ticked done logs the planned foods that were sent for it, at the amounts sent.
 */
export function planInbound(inbound: Inbound, sessions: Session[], weighInKg: number | null, sentMeals: SentMeal[]): Changes {
  const changes: Changes = { insert: [], update: [], remove: [], weightKg: null, log: [] };
  const day = sessions.filter((s) => s.date === inbound.date);
  const seen = new Set<string>();

  for (const t of inbound.training) {
    seen.add(t.ref);
    const duration = Math.max(1, Math.min(1440, Math.round(t.durationMin || 0) || 60));
    const start = hhmm(t.startTime);
    const ours = t.ref.startsWith('acc:session:') ? day.find((s) => `acc:session:${s.id}` === t.ref) : day.find((s) => s.external_ref === t.ref);
    if (!ours) {
      if (!t.ref.startsWith('acc:session:')) {
        changes.insert.push({ activity: fromLedgerType(t.type), duration_min: duration, start_time: start, external_ref: t.ref });
      }
      continue;
    }
    const patch: Changes['update'][number]['patch'] = {};
    if (hhmm(ours.start_time) !== start) patch.start_time = start;
    if (ours.actual_duration_min == null && ours.duration_min !== duration) patch.duration_min = duration;
    if (toLedgerType(ours.activity) !== t.type) patch.activity = fromLedgerType(t.type);
    if (Object.keys(patch).length) changes.update.push({ id: ours.id, patch });
  }
  for (const s of day) {
    if (s.external_ref && s.external_ref.startsWith('ledger:') && !seen.has(s.external_ref) && s.actual_kcal == null) {
      changes.remove.push(s.id);
    }
  }

  if (inbound.weightKg != null && inbound.weightKg >= 30 && inbound.weightKg <= 300) {
    if (weighInKg == null || Math.abs(weighInKg - inbound.weightKg) > 0.05) changes.weightKg = Math.round(inbound.weightKg * 100) / 100;
  }

  for (const ref of inbound.mealsDone) {
    const meal = sentMeals.find((m) => m.ref === ref);
    if (meal) changes.log.push(...meal.planned);
  }
  return changes;
}

/** Smoothed weight trend (the app's EWMA, alpha 0.1 per day) at the latest weigh-in. */
export function latestTrend(weighIns: { date: string; weight_kg: number }[], alpha = 0.1): number | null {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  let trend: number | null = null;
  let prev: string | null = null;
  for (const w of sorted) {
    if (trend == null) trend = w.weight_kg;
    else {
      const gap = Math.max(1, Math.round((Date.parse(w.date) - Date.parse(prev!)) / 86_400_000));
      trend += (1 - Math.pow(1 - alpha, gap)) * (w.weight_kg - trend);
    }
    prev = w.date;
  }
  return trend;
}
