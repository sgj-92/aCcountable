import { describe, expect, it } from '@jest/globals';

import { dayTarget, DEFAULT_SETTINGS, sessionBurnDetail, type BodyStats } from '../nutrition';
import { balanceWeek, type WeekDayInput } from '../weekly';
import { judgePace, weeklyRate, weightTrend } from '../weight';
import {
  burnRates,
  burnRatesByName,
  activityName,
  mapWhoopActivity,
  matchToSessions,
  normaliseStart,
  parseCsv,
  parseWhoopWorkouts,
  ratesForModel,
} from '../whoop';

// Shaped like WHOOP's workouts.csv (Settings → Data Export).
const WHOOP_CSV = [
  'Cycle start time,Cycle end time,Cycle timezone,Workout start time,Workout end time,Duration (min),Activity name,Activity Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm)',
  '2026-11-01 07:10:00,2026-11-02 06:50:00,UTC+04:00,2026-11-01 19:00:00,2026-11-01 20:30:00,90,Padel,14.2,860,176,141',
  '2026-11-03 06:55:00,2026-11-04 07:05:00,UTC+04:00,2026-11-03 18:30:00,2026-11-03 20:00:00,90,Padel,13.1,790,171,137',
  '2026-11-05 07:00:00,2026-11-06 07:00:00,UTC+04:00,2026-11-05 19:05:00,2026-11-05 20:05:00,60,Padel,11.0,575,168,135',
  '2026-11-02 07:00:00,2026-11-03 07:00:00,UTC+04:00,2026-11-02 06:30:00,2026-11-02 07:30:00,60,Weightlifting,8.2,380,150,112',
  '2026-11-04 07:00:00,2026-11-05 07:00:00,UTC+04:00,2026-11-04 06:30:00,2026-11-04 06:35:00,5,Walking,1.0,25,95,88',
  '2026-11-06 07:00:00,2026-11-07 07:00:00,UTC+04:00,,,,"Running, outdoor",,,,',
].join('\n');

describe('WHOOP import', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('finds the columns by name and reads workouts', () => {
    const r = parseWhoopWorkouts(WHOOP_CSV);
    expect(r.columns.start).toBe('Workout start time');
    expect(r.columns.energy).toBe('Energy burned (cal)');
    expect(r.workouts).toHaveLength(5);
    expect(r.skipped).toBe(1); // the row with no workout data
    expect(r.workouts[0]).toMatchObject({
      date: '2026-11-01',
      activityName: 'Padel',
      activity: 'padel',
      durationMin: 90,
      kcal: 860,
      avgHr: 141,
    });
  });

  it('converts kJ exports and other date formats', () => {
    const r = parseWhoopWorkouts('Start time,Duration (min),Activity,Energy (kJ)\n03/11/2026 18:30,60,Tennis,2092');
    expect(r.energyUnit).toBe('kJ');
    expect(r.workouts[0]).toMatchObject({ date: '2026-11-03', activity: 'tennis', kcal: 500 });
    expect(normaliseStart('2026-11-03T18:30:00Z')).toBe('2026-11-03 18:30:00');
  });

  it('maps WHOOP activity names', () => {
    expect(mapWhoopActivity('Functional Fitness')).toBe('hiit');
    expect(mapWhoopActivity('Spin')).toBe('cycle');
    expect(mapWhoopActivity('Soccer')).toBe('sport');
    expect(mapWhoopActivity('Meditation')).toBe('yoga');
    expect(mapWhoopActivity('Paddle Tennis')).toBe('padel');
    expect(mapWhoopActivity('Tennis')).toBe('tennis');
  });

  it('shows WHOOP activities under the app\'s (and Ledger\'s) names where it has its own', () => {
    expect(activityName('Paddle Tennis', 'tennis')).toBe('Padel');
    expect(activityName('Weightlifting', 'strength')).toBe('Strength');
    expect(activityName('Functional Fitness', 'hiit')).toBe('HIIT');
    expect(activityName('Running', 'run')).toBe('Running');
    expect(activityName('Squash', 'tennis')).toBe('Squash');
    expect(activityName(null, 'padel')).toBe('Padel');
    expect(mapWhoopActivity('Something new')).toBe('other');
  });

  it('learns a robust personal rate per activity, ignoring very short sessions', () => {
    const rates = burnRates(parseWhoopWorkouts(WHOOP_CSV).workouts);
    const padel = rates.find((r) => r.activity === 'padel')!;
    expect(padel.samples).toBe(3);
    expect(padel.kcalPerMin).toBeCloseTo(9.56, 1); // median of 9.56, 8.78, 9.58
    expect(padel.typicalMin).toBe(90);
    expect(rates.find((r) => r.activity === 'walk')).toBeUndefined(); // 5-minute walk ignored
  });

  it('matches imported workouts to unconfirmed sessions', () => {
    const workouts = parseWhoopWorkouts(WHOOP_CSV).workouts;
    const m = matchToSessions(workouts, [
      { id: 's1', date: '2026-11-03', activity: 'padel' as const, duration_min: 75 },
      { id: 's2', date: '2026-11-03', activity: 'run' as const, duration_min: 30 },
    ]);
    expect(m).toEqual([{ sessionId: 's1', workout: expect.objectContaining({ kcal: 790 }) }]);
  });
});

describe('WHOOP activity names', () => {
  const csv = [
    'Workout start time,Duration (min),Activity name,Energy burned (cal)',
    '2026-11-01 07:00:00,45,Spin,600',
    '2026-11-02 07:00:00,45,Spin,630',
    '2026-11-03 07:00:00,60,Cycling,500',
    '2026-11-04 07:00:00,60,Cycling,520',
    '2026-11-05 07:00:00,60,Cycling,480',
  ].join('\n');
  const workouts = parseWhoopWorkouts(csv).workouts;

  it('keeps each WHOOP activity separate, most-logged first', () => {
    const named = burnRatesByName(workouts);
    expect(named.map((r) => [r.label, r.samples])).toEqual([
      ['Cycling', 3],
      ['Spin', 2],
    ]);
    // Both map to the same app type, which blends them.
    expect(burnRates(workouts)).toHaveLength(1);
  });

  it('estimates from the exact WHOOP activity picked, not the blended type', () => {
    const rates = ratesForModel(burnRates(workouts), burnRatesByName(workouts));
    const ctx = { weightKg: 80, bmr: 1912, rates };
    const spin = sessionBurnDetail({ activity: 'cycle', durationMin: 45, intensity: 'moderate', whoopActivity: 'Spin' }, ctx);
    const generic = sessionBurnDetail({ activity: 'cycle', durationMin: 45, intensity: 'moderate' }, ctx);
    expect(spin.samples).toBe(2);
    expect(spin.net).toBeCloseTo(13.67 * 45 - (1912 / 1440) * 45, -1); // Spin burns ~13.7 kcal/min
    expect(generic.samples).toBe(5);
    expect(spin.net).toBeGreaterThan(generic.net);
  });

  it('matches re-imported workouts by WHOOP name when the session has one', () => {
    const m = matchToSessions(workouts, [
      { id: 'a', date: '2026-11-01', activity: 'cycle' as const, duration_min: 60, whoop_activity: 'Cycling' },
      { id: 'b', date: '2026-11-02', activity: 'cycle' as const, duration_min: 45, whoop_activity: 'spin' },
    ]);
    expect(m.map((x) => x.sessionId)).toEqual(['b']); // no Cycling on the 1st, only Spin
  });
});

describe('session burn sources', () => {
  const ctxBase = { weightKg: 80, bmr: 1912 };

  it('uses confirmed WHOOP calories first, minus resting burn', () => {
    const d = sessionBurnDetail(
      { activity: 'padel', durationMin: 60, intensity: 'moderate', actualKcal: 860, actualDurationMin: 90 },
      ctxBase,
    );
    expect(d.source).toBe('actual');
    expect(d.net).toBeCloseTo(860 - (1912 / 1440) * 90, 0); // ≈ 740
  });

  it('then the personal WHOOP rate, scaled by intensity', () => {
    const rates = ratesForModel(burnRates(parseWhoopWorkouts(WHOOP_CSV).workouts));
    const moderate = sessionBurnDetail({ activity: 'padel', durationMin: 90, intensity: 'moderate' }, { ...ctxBase, rates });
    const hard = sessionBurnDetail({ activity: 'padel', durationMin: 90, intensity: 'hard' }, { ...ctxBase, rates });
    expect(moderate).toMatchObject({ source: 'history', samples: 3 });
    expect(moderate.net).toBeCloseTo(9.56 * 90 - (1912 / 1440) * 90, -1); // ≈ 740
    expect(hard.net).toBeGreaterThan(moderate.net);
  });

  it('falls back to METs without history', () => {
    expect(sessionBurnDetail({ activity: 'padel', durationMin: 60, intensity: 'moderate' }, ctxBase).source).toBe('formula');
  });
});

describe('weekly balancing', () => {
  const stats: BodyStats = { sex: 'male', age: 34, heightCm: 180, weightKg: 80 };
  const lose = { ...DEFAULT_SETTINGS, goal: 'lose' as const, goalRateKgPerWeek: 0.5, lifestyle: 'moderate' as const };
  const rest = dayTarget(stats, lose, []).kcal;
  const week = (overrides: Partial<WeekDayInput>[] = []): WeekDayInput[] =>
    ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((date, i) => ({
      date,
      target: rest,
      eaten: 0,
      logged: false,
      ...overrides[i],
    }));

  it('spreads an overshoot across the rest of the week', () => {
    // Monday 700 over, today is Tuesday: six days left take ~117 each.
    const b = balanceWeek(week([{ eaten: rest + 700, logged: true }]), '2026-11-17', { bmr: 1760 });
    expect(b.carried).toBe(700);
    expect(b.days[1].adjustment).toBe(-117);
    expect(b.unabsorbed).toBe(0);
    expect(Math.abs(b.projected - b.budget)).toBeLessThan(5);
  });

  it('accepts an unplanned padel night: the session raises that day’s target, so eating more is on plan', () => {
    const rates = ratesForModel(burnRates(parseWhoopWorkouts(WHOOP_CSV).workouts));
    const padelDay = dayTarget(stats, lose, [{ activity: 'padel', durationMin: 90, intensity: 'moderate' }], rates).kcal;
    expect(padelDay - rest).toBeGreaterThan(600);
    // Ate 650 more than a rest day, but logged the padel: nothing to claw back.
    const b = balanceWeek(week([{ target: padelDay, eaten: rest + 650, logged: true }]), '2026-11-17', { bmr: 1760 });
    expect(b.carried).toBeLessThanOrEqual(0);
    expect(b.days[1].adjustment).toBeGreaterThanOrEqual(0);
  });

  it('caps cuts per day and never goes below BMR, reporting what is left over', () => {
    // 3,000 over with one day left, and that day's target sits near BMR.
    const days = week(
      Array.from({ length: 6 }, (_, i) => (i === 0 ? { eaten: rest + 3000, logged: true } : { eaten: rest, logged: true })),
    );
    days[6].target = 1900;
    const b = balanceWeek(days, '2026-11-22', { bmr: 1760 });
    expect(b.days[6].adjustment).toBe(-140); // limited by BMR (1,900 → 1,760), not the 400 cap
    expect(b.unabsorbed).toBe(2860);
  });

  it('gives back under-eating only up to the limit, and ignores untracked days', () => {
    const b = balanceWeek(
      week([
        { eaten: rest - 1500, logged: true },
        { eaten: 0, logged: false },
      ]),
      '2026-11-21',
      { bmr: 1760 },
    );
    expect(b.days[1].status).toBe('untracked');
    expect(b.carried).toBe(-1500);
    expect(b.days[5].adjustment).toBe(200);
    expect(b.days[6].adjustment).toBe(200);
  });
});

describe('weight trend', () => {
  // 21 days losing ~0.5 kg/week with ±0.6 kg daily noise.
  const noise = [0.4, -0.5, 0.2, 0.6, -0.3, 0.1, -0.6, 0.3, 0.5, -0.2, 0, -0.4, 0.6, 0.2, -0.5, 0.3, -0.1, 0.4, -0.6, 0.2, 0];
  const weighIns = noise.map((n, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    weight_kg: 85 - (0.5 / 7) * i + n,
  }));

  it('smooths daily noise and measures the weekly rate', () => {
    const trend = weightTrend(weighIns);
    const rawSwing = Math.max(...weighIns.map((w) => w.weight_kg)) - Math.min(...weighIns.map((w) => w.weight_kg));
    const trendSwing = Math.max(...trend.map((t) => t.trend)) - Math.min(...trend.map((t) => t.trend));
    expect(trendSwing).toBeLessThan(rawSwing);
    const rate = weeklyRate(trend)!;
    expect(rate).toBeLessThan(-0.2);
    expect(rate).toBeGreaterThan(-0.7);
  });

  it('judges the pace against the goal', () => {
    expect(judgePace(null, 'lose', 0.5)).toBe('not-enough-data');
    expect(judgePace(-0.45, 'lose', 0.5)).toBe('on-track');
    expect(judgePace(-0.1, 'lose', 0.5)).toBe('too-slow');
    expect(judgePace(0.3, 'lose', 0.5)).toBe('wrong-direction');
    expect(judgePace(-1.2, 'lose', 0.5)).toBe('too-fast');
  });

  it('needs at least a week of data', () => {
    expect(weeklyRate(weightTrend(weighIns.slice(0, 4)))).toBeNull();
  });
});
