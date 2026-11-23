import { describe, expect, it } from '@jest/globals';

import { mealTimes } from '../meal-times';

const five = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5'].map((key) => ({ key }));
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const show = (r: ReturnType<typeof mealTimes>) =>
  Object.values(r).map((t) => `${hm(t.minutes)}${t.tag ? ` ${t.tag}` : ''}`);

describe('mealTimes', () => {
  it('spreads meals across the day without training', () => {
    expect(show(mealTimes(five, [], null))).toEqual(['07:30', '10:45', '14:00', '17:15', '20:30']);
  });

  it('times meals around evening training', () => {
    // Padel 18:00–19:30.
    expect(show(mealTimes(five, [{ startMin: 18 * 60, durationMin: 90 }], null))).toEqual([
      '07:30',
      '10:30',
      '13:30',
      '16:00 pre',
      '20:30 post',
    ]);
  });

  it('puts the first meal after early-morning training', () => {
    const r = show(mealTimes(five, [{ startMin: 6 * 60 + 30, durationMin: 60 }], null));
    expect(r[0]).toBe('08:30 post');
  });

  it('puts meals either side of midday training', () => {
    const r = show(mealTimes(five, [{ startMin: 12 * 60, durationMin: 60 }], null));
    expect(r).toEqual(['07:30', '10:00 pre', '14:00 post', '17:15', '20:30']);
  });

  it('stays inside the eating window', () => {
    const r = mealTimes(five.slice(0, 3), [{ startMin: 17 * 60, durationMin: 60 }], { startMin: 12 * 60, endMin: 20 * 60 });
    expect(show(r)).toEqual(['12:00', '15:00 pre', '19:00 post']);
  });
});
