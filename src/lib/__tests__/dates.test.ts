import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  ageOn,
  dmyToIso,
  formatDmyInput,
  formatWeekRange,
  isoToDmy,
  isValidISODate,
  startOfWeek,
  weekDates,
} from '../dates';

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-14')).toBe('2026-11-09'); // Saturday → Monday
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // Sunday belongs to the same week
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(weekDates('2026-11-09')).toHaveLength(7);
  });

  it('formats week ranges', () => {
    expect(formatWeekRange('2026-11-09')).toBe('9 – 15 Nov');
    expect(formatWeekRange('2026-10-26')).toBe('26 Oct – 1 Nov');
  });

  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('14/11/2026')).toBe(false);
  });

  it('computes age on a given day', () => {
    expect(ageOn('1990-11-15', '2026-11-14')).toBe(35);
    expect(ageOn('1990-11-14', '2026-11-14')).toBe(36);
  });
});

describe('DD-MM-YYYY entry', () => {
  it('inserts dashes as digits are typed', () => {
    expect(formatDmyInput('0')).toBe('0');
    expect(formatDmyInput('01')).toBe('01');
    expect(formatDmyInput('010')).toBe('01-0');
    expect(formatDmyInput('0105')).toBe('01-05');
    expect(formatDmyInput('01051')).toBe('01-05-1');
    expect(formatDmyInput('01051992')).toBe('01-05-1992');
  });

  it('ignores typed or pasted punctuation and caps at 8 digits', () => {
    expect(formatDmyInput('01/05/1992')).toBe('01-05-1992');
    expect(formatDmyInput('01-05-19921')).toBe('01-05-1992');
    // Backspacing over an auto-inserted dash just removes the digit before it.
    expect(formatDmyInput('01-05')).toBe('01-05');
    expect(formatDmyInput('01-')).toBe('01');
  });

  it('converts between DD-MM-YYYY and ISO, rejecting impossible dates', () => {
    expect(isoToDmy('1992-05-01')).toBe('01-05-1992');
    expect(isoToDmy(null)).toBe('');
    expect(dmyToIso('01-05-1992')).toBe('1992-05-01');
    expect(dmyToIso('31-02-1992')).toBeNull();
    expect(dmyToIso('01-05-92')).toBeNull();
  });
});
