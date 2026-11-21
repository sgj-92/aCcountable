import { describe, expect, it } from '@jest/globals';

import { weekSummary } from '../week-summary';
import { balanceWeek } from '../weekly';

// Mon 16 – Sun 22 Nov 2026; today is Thu 19.
const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const week = (eaten: number[], target = 2000) =>
  balanceWeek(
    dates.map((date, i) => ({ date, target, eaten: eaten[i] ?? 0, logged: (eaten[i] ?? 0) > 0 })),
    '2026-11-19',
    { bmr: 1500 },
  );

describe('weekSummary', () => {
  it('says on budget when the finished days hit their targets', () => {
    const s = weekSummary(week([2000, 2000, 2000]));
    expect(s.tone).toBe('good');
    expect(s.head).toBe('Week on budget');
  });

  it('spreads an overshoot over today and the days left', () => {
    const s = weekSummary(week([2400, 2000, 2000]));
    expect(s.tone).toBe('info');
    expect(s.head).toBe('Week 400 over so far');
    expect(s.tail).toBe('· Thu–Sun −100 a day');
  });

  it('warns when the rest of the week cannot absorb it', () => {
    const s = weekSummary(week([3500, 3500, 3500]));
    expect(s.tone).toBe('warn');
    expect(s.head).toMatch(/^Week [\d,]+ over$/);
    expect(s.tail).toContain('Thu–Sun −400 a day');
  });

  it('gives a little back after an under day', () => {
    const s = weekSummary(week([1600, 2000, 2000]));
    expect(s.tone).toBe('good');
    expect(s.head).toBe('Week 400 under so far');
    expect(s.tail).toBe('· Thu–Sun +100 a day');
  });
});
