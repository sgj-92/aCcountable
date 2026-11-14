/**
 * Local-calendar date helpers. Dates are passed around as 'YYYY-MM-DD' strings
 * (matching Postgres `date`) to avoid timezone drift from Date objects.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = parseISODate(s);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -offset);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function dayName(s: string): string {
  return DAY_NAMES[parseISODate(s).getDay()];
}

/** e.g. "Fri 14 Nov" */
export function formatDay(s: string): string {
  const d = parseISODate(s);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** e.g. "10 – 16 Nov" or "28 Oct – 3 Nov" */
export function formatWeekRange(weekStart: string): string {
  const a = parseISODate(weekStart);
  const b = parseISODate(addDays(weekStart, 6));
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTH_NAMES[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MONTH_NAMES[b.getMonth()]}`;
}

export function ageOn(birthDate: string, on: string): number {
  const b = parseISODate(birthDate);
  const d = parseISODate(on);
  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday =
    d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
