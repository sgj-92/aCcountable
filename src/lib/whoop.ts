/**
 * WHOOP data export (Settings → Data Export) → workouts with calories, and the
 * person's own burn rate per activity.
 *
 * Columns are found by name, not position, so small changes to WHOOP's export
 * format don't break the import; the import screen shows what was detected.
 */
import type { Activity } from './nutrition';

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
  if (has('padel')) return 'padel';
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
export function burnRates(
  workouts: Pick<WhoopWorkout, 'activity' | 'activityName' | 'durationMin' | 'kcal' | 'startedAt'>[],
  maxPerActivity = 30,
): ActivityRate[] {
  const groups = new Map<Activity, typeof workouts>();
  for (const w of workouts) {
    if (w.durationMin < 10 || w.kcal <= 0) continue;
    groups.set(w.activity, [...(groups.get(w.activity) ?? []), w]);
  }
  const out: ActivityRate[] = [];
  for (const [activity, list] of groups) {
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

/** Rates in the shape the burn model takes. */
export function ratesForModel(rates: ActivityRate[]) {
  const out: Partial<Record<Activity, { kcalPerMin: number; samples: number }>> = {};
  for (const r of rates) out[r.activity] = { kcalPerMin: r.kcalPerMin, samples: r.samples };
  return out;
}

/**
 * Pairs imported WHOOP workouts with planned sessions on the same day and
 * activity that haven't been confirmed yet (closest duration wins), so a
 * re-import fills in actual burns automatically.
 */
export function matchToSessions<S extends { id: string; date: string; activity: Activity; duration_min: number }>(
  workouts: WhoopWorkout[],
  sessions: S[],
): { sessionId: string; workout: WhoopWorkout }[] {
  const used = new Set<string>();
  const out: { sessionId: string; workout: WhoopWorkout }[] = [];
  for (const s of sessions) {
    const candidates = workouts
      .filter((w) => w.date === s.date && w.activity === s.activity && !used.has(w.startedAt))
      .sort((a, b) => Math.abs(a.durationMin - s.duration_min) - Math.abs(b.durationMin - s.duration_min));
    if (candidates[0]) {
      used.add(candidates[0].startedAt);
      out.push({ sessionId: s.id, workout: candidates[0] });
    }
  }
  return out;
}
