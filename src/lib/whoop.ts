/**
 * WHOOP data export (Settings → Data Export) → workouts with calories, and the
 * person's own burn rate per activity.
 *
 * Columns are found by name, not position, so small changes to WHOOP's export
 * format don't break the import; the import screen shows what was detected.
 */
import { ACTIVITY_LABELS, type Activity } from './nutrition';

export interface WhoopWorkout {
  /** Local start time as exported, "YYYY-MM-DD HH:MM:SS". */
  startedAt: string;
  date: string;
  activityName: string;
  activity: Activity;
  durationMin: number;
  /** Total calories burned during the workout (WHOOP's "Energy burned"). */
  kcal: number;
  strain: number | null;
  avgHr: number | null;
}

export interface ParsedExport {
  workouts: WhoopWorkout[];
  /** Header that each field was read from (for showing the person). */
  columns: Record<'start' | 'activity' | 'duration' | 'energy', string | null> & {
    strain: string | null;
    avgHr: string | null;
  };
  skipped: number;
  energyUnit: 'kcal' | 'kJ';
}

/** RFC 4180-style CSV parsing (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, ' ').trim();

function findColumn(headers: string[], tests: ((h: string) => boolean)[]): number {
  for (const test of tests) {
    const i = headers.findIndex((h) => test(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}

/** WHOOP activity name → the app's activity type (for MET fallbacks and rate grouping). */
export function mapWhoopActivity(name: string): Activity {
  const n = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  // WHOOP calls padel "Paddle Tennis"; check before tennis.
  if (has('padel', 'paddle')) return 'padel';
  if (has('tennis', 'squash', 'pickleball', 'badminton', 'racquet', 'table tennis')) return 'tennis';
  if (has('run', 'jog', 'treadmill', 'track')) return 'run';
  if (has('cycl', 'spin', 'bik', 'peloton')) return 'cycle';
  if (has('swim')) return 'swim';
  if (has('row')) return 'row';
  if (has('hiit', 'functional', 'crossfit', 'circuit', 'bootcamp', 'f45')) return 'hiit';
  if (has('weight', 'strength', 'powerlift', 'lifting', 'gym', 'resistance')) return 'strength';
  if (has('walk', 'hik', 'ruck')) return 'walk';
  if (has('yoga', 'pilates', 'stretch', 'mobility', 'meditation')) return 'yoga';
  if (
    has('soccer', 'football', 'basketball', 'rugby', 'hockey', 'volleyball', 'netball', 'cricket', 'baseball', 'lacrosse', 'sport')
  )
    return 'sport';
  return 'other';
}

const toNum = (s: string | undefined) => {
  if (s == null) return NaN;
  const v = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return String(s).trim() === '' ? NaN : v;
};

/** "2026-11-12 18:02:11", "2026-11-12T18:02:11Z", "12/11/2026 18:02" → "YYYY-MM-DD HH:MM:SS". */
export function normaliseStart(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? '00'}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    const pad = (x: string) => x.padStart(2, '0');
    return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4])}:${m[5]}:${m[6] ?? '00'}`;
  }
  return null;
}

export function parseWhoopWorkouts(csv: string): ParsedExport {
  const rows = parseCsv(csv);
  const headers = rows[0] ?? [];
  const col = {
    start: findColumn(headers, [(h) => h.startsWith('workout start'), (h) => h.includes('start time'), (h) => h === 'start']),
    activity: findColumn(headers, [(h) => h.startsWith('activity name'), (h) => h === 'activity', (h) => h.includes('sport')]),
    duration: findColumn(headers, [(h) => h.startsWith('duration')]),
    energy: findColumn(headers, [
      (h) => h.startsWith('energy burned'),
      (h) => h.includes('calories'),
      (h) => h.includes('kcal'),
      (h) => h.includes('energy'),
    ]),
    strain: findColumn(headers, [(h) => h.includes('strain')]),
    avgHr: findColumn(headers, [(h) => h.startsWith('average hr') || h.startsWith('avg hr') || h.includes('average heart')]),
  };
  const energyHeader = col.energy >= 0 ? norm(headers[col.energy]) : '';
  const energyUnit: 'kcal' | 'kJ' = /\bkj\b|kilojoule/.test(energyHeader) ? 'kJ' : 'kcal';

  const workouts: WhoopWorkout[] = [];
  let skipped = 0;
  if (col.start >= 0 && col.duration >= 0 && col.energy >= 0) {
    for (const r of rows.slice(1)) {
      const startedAt = normaliseStart(r[col.start] ?? '');
      const duration = toNum(r[col.duration]);
      let kcal = toNum(r[col.energy]);
      if (energyUnit === 'kJ') kcal /= 4.184;
      if (!startedAt || !(duration > 0) || !(kcal > 0) || duration > 1440) {
        skipped++;
        continue;
      }
      const activityName = (col.activity >= 0 ? r[col.activity] : '')?.trim() || 'Activity';
      const strain = col.strain >= 0 ? toNum(r[col.strain]) : NaN;
      const avgHr = col.avgHr >= 0 ? toNum(r[col.avgHr]) : NaN;
      workouts.push({
        startedAt,
        date: startedAt.slice(0, 10),
        activityName,
        activity: mapWhoopActivity(activityName),
        durationMin: Math.round(duration * 10) / 10,
        kcal: Math.round(kcal),
        strain: Number.isFinite(strain) ? strain : null,
        avgHr: Number.isFinite(avgHr) ? Math.round(avgHr) : null,
      });
    }
  } else {
    skipped = Math.max(0, rows.length - 1);
  }

  const name = (i: number) => (i >= 0 ? headers[i] : null);
  return {
    workouts,
    columns: {
      start: name(col.start),
      activity: name(col.activity),
      duration: name(col.duration),
      energy: name(col.energy),
      strain: name(col.strain),
      avgHr: name(col.avgHr),
    },
    skipped,
    energyUnit,
  };
}

export interface ActivityRate {
  activity: Activity;
  /** Typical total kcal per minute (median, robust to odd sessions). */
  kcalPerMin: number;
  samples: number;
  /** Most common WHOOP name for this group, e.g. "Padel". */
  label: string;
  /** Typical session length, minutes (median). */
  typicalMin: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The person's burn rate per activity. Uses the most recent `maxPerActivity`
 * sessions so fitness changes show through, and ignores sessions under 10
 * minutes (too noisy).
 */
type RateInput = Pick<WhoopWorkout, 'activity' | 'activityName' | 'durationMin' | 'kcal' | 'startedAt'>;

export function burnRates(workouts: RateInput[], maxPerActivity = 30): ActivityRate[] {
  return groupRates(workouts, (w) => w.activity, maxPerActivity);
}

/**
 * Rates per exact WHOOP activity name ("Running", "Padel", "Functional
 * Fitness"), most-logged first. These are what the session picker offers.
 */
export function burnRatesByName(workouts: RateInput[], maxPerActivity = 30): ActivityRate[] {
  return groupRates(workouts, (w) => w.activityName.trim(), maxPerActivity);
}

function groupRates(workouts: RateInput[], keyOf: (w: RateInput) => string, maxPerActivity: number): ActivityRate[] {
  const groups = new Map<string, RateInput[]>();
  for (const w of workouts) {
    if (w.durationMin < 10 || w.kcal <= 0) continue;
    const key = keyOf(w);
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const out: ActivityRate[] = [];
  for (const [, list] of groups) {
    const activity = list[0].activity;
    const recent = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, maxPerActivity);
    const names = new Map<string, number>();
    for (const w of recent) names.set(w.activityName, (names.get(w.activityName) ?? 0) + 1);
    const label = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      activity,
      kcalPerMin: Math.round(median(recent.map((w) => w.kcal / w.durationMin)) * 100) / 100,
      samples: recent.length,
      label,
      typicalMin: Math.round(median(recent.map((w) => w.durationMin))),
    });
  }
  return out.sort((a, b) => b.samples - a.samples);
}

/** Rates in the shape the burn model takes: by app activity type, and by exact WHOOP name. */
export function ratesForModel(byActivity: ActivityRate[], byName: ActivityRate[] = []) {
  const activity: Partial<Record<Activity, { kcalPerMin: number; samples: number }>> = {};
  for (const r of byActivity) activity[r.activity] = { kcalPerMin: r.kcalPerMin, samples: r.samples };
  const name: Record<string, { kcalPerMin: number; samples: number }> = {};
  for (const r of byName) name[r.label.toLowerCase()] = { kcalPerMin: r.kcalPerMin, samples: r.samples };
  return { byActivity: activity, byName: name };
}

/**
 * The name to show for an activity. WHOOP's own name, except for activities the app
 * (and Ledger) name themselves: "Paddle Tennis" is Padel, "Weightlifting" is Strength.
 * The WHOOP name is still kept on the session for matching its workouts.
 */
const OWN_NAMES: Partial<Record<Activity, string>> = { padel: 'Padel', strength: 'Strength', hiit: 'HIIT' };
export function activityName(whoopName: string | null | undefined, activity: Activity): string {
  if (!whoopName) return ACTIVITY_LABELS[activity];
  return OWN_NAMES[mapWhoopActivity(whoopName)] ?? whoopName;
}

/** Rates from stored WHOOP rows (as the API returns them). */
export function ratesFromRows(
  rows: { activity: Activity; activity_name: string; duration_min: number; kcal: number; started_at: string }[],
) {
  const input = rows.map((w) => ({
    // From the name, not the stored type, so rows imported before a mapping fix still group right.
    activity: mapWhoopActivity(w.activity_name),
    activityName: w.activity_name,
    durationMin: w.duration_min,
    kcal: w.kcal,
    startedAt: w.started_at,
  }));
  return { byActivity: burnRates(input), byName: burnRatesByName(input) };
}

/**
 * Pairs imported WHOOP workouts with planned sessions on the same day and
 * activity that haven't been confirmed yet (closest duration wins), so a
 * re-import fills in actual burns automatically.
 */
export function matchToSessions<
  S extends { id: string; date: string; activity: Activity; duration_min: number; whoop_activity?: string | null },
>(workouts: WhoopWorkout[], sessions: S[]): { sessionId: string; workout: WhoopWorkout }[] {
  const used = new Set<string>();
  const out: { sessionId: string; workout: WhoopWorkout }[] = [];
  for (const s of sessions) {
    // A session picked from the WHOOP list matches that exact name; others match by type.
    const same = (w: WhoopWorkout) =>
      s.whoop_activity
        ? w.activityName.trim().toLowerCase() === s.whoop_activity.trim().toLowerCase()
        : w.activity === s.activity;
    const candidates = workouts
      .filter((w) => w.date === s.date && same(w) && !used.has(w.startedAt))
      .sort((a, b) => Math.abs(a.durationMin - s.duration_min) - Math.abs(b.durationMin - s.duration_min));
    if (candidates[0]) {
      used.add(candidates[0].startedAt);
      out.push({ sessionId: s.id, workout: candidates[0] });
    }
  }
  return out;
}
