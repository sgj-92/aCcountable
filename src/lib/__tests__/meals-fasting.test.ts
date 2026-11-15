import { describe, expect, it } from '@jest/globals';

import {
  fastingStatus,
  formatClock,
  formatClockInput,
  formatDuration,
  parseClock,
} from '../fasting';
import {
  addSlot,
  CLASSIC_SLOTS,
  defaultSlotForNow,
  numberedSlots,
  resolveSlots,
  slotsForData,
} from '../meals';

const at = (h: number, m = 0) => new Date(2026, 10, 15, h, m);

describe('meal slots', () => {
  it('builds numbered presets within 1–6 meals', () => {
    expect(numberedSlots(3).map((s) => s.label)).toEqual(['Meal 1', 'Meal 2', 'Meal 3']);
    expect(numberedSlots(3).map((s) => s.key)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(numberedSlots(9)).toHaveLength(6);
    expect(numberedSlots(0)).toHaveLength(1);
  });

  it('validates stored slots and falls back to the classic set', () => {
    expect(resolveSlots(null)).toEqual(CLASSIC_SLOTS);
    expect(resolveSlots([{ key: 'nope', label: 'x' }])).toEqual(CLASSIC_SLOTS);
    expect(
      resolveSlots([
        { key: 'lunch', label: '  Pre-workout ' },
        { key: 'lunch', label: 'dup' },
        { key: 'dinner', label: '' },
      ]),
    ).toEqual([
      { key: 'lunch', label: 'Pre-workout' },
      { key: 'dinner', label: 'Dinner' },
    ]);
  });

  it('keeps entries visible when their meal is no longer configured', () => {
    const two = numberedSlots(2);
    expect(slotsForData(two, ['breakfast', 'snack', 'dinner']).map((s) => s.label)).toEqual([
      'Meal 1',
      'Meal 2',
      'Dinner',
      'Snacks',
    ]);
  });

  it('adds the next free slot', () => {
    expect(addSlot(numberedSlots(2)).at(-1)).toEqual({ key: 'dinner', label: 'Meal 3' });
    expect(addSlot(numberedSlots(6))).toHaveLength(6);
  });

  it('picks a default meal by time of day', () => {
    expect(defaultSlotForNow(CLASSIC_SLOTS, at(8))).toBe('breakfast');
    expect(defaultSlotForNow(CLASSIC_SLOTS, at(13))).toBe('lunch');
    expect(defaultSlotForNow(CLASSIC_SLOTS, at(19))).toBe('dinner');
    expect(defaultSlotForNow(CLASSIC_SLOTS, at(23))).toBe('snack');
  });

  it('splits a fasting window evenly across the meals', () => {
    const slots = numberedSlots(2);
    const window = { startMin: 12 * 60, endMin: 20 * 60 };
    expect(defaultSlotForNow(slots, at(12, 30), window)).toBe('breakfast');
    expect(defaultSlotForNow(slots, at(17), window)).toBe('lunch');
    expect(defaultSlotForNow(slots, at(22), window)).toBe('lunch'); // outside: last meal
  });
});

describe('fasting', () => {
  it('parses and formats clock times', () => {
    expect(parseClock('12:00')).toBe(720);
    expect(parseClock('08:30:00')).toBe(510);
    expect(parseClock('24:00')).toBeNull();
    expect(formatClock(1450)).toBe('00:10');
    expect(formatClockInput('1')).toBe('1');
    expect(formatClockInput('123')).toBe('12:3');
    expect(formatClockInput('12:30')).toBe('12:30');
    expect(formatDuration(192)).toBe('3h 12m');
    expect(formatDuration(45)).toBe('45m');
  });

  it('tracks a 16:8 window (12:00–20:00)', () => {
    const eating = fastingStatus(at(16, 48), 720, 1200);
    expect(eating.state).toBe('eating');
    expect(eating.minutesLeft).toBe(192);
    expect(eating.total).toBe(480);

    const fastingNight = fastingStatus(at(22), 720, 1200);
    expect(fastingNight).toMatchObject({ state: 'fasting', elapsed: 120, total: 960, changesAt: 720 });

    const fastingMorning = fastingStatus(at(10, 5), 720, 1200);
    expect(fastingMorning.state).toBe('fasting');
    expect(fastingMorning.minutesLeft).toBe(115);
    expect(fastingMorning.elapsed).toBe(845); // since 20:00 yesterday
  });

  it('handles windows that cross midnight', () => {
    expect(fastingStatus(at(23), 20 * 60, 2 * 60).state).toBe('eating');
    expect(fastingStatus(at(1), 20 * 60, 2 * 60).minutesLeft).toBe(60);
    expect(fastingStatus(at(3), 20 * 60, 2 * 60).state).toBe('fasting');
  });
});
