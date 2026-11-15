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

// ───────────── DD-MM-YYYY entry (birth date field) ─────────────

/** Formats typed text as DD-MM-YYYY, inserting the dashes itself so only digits need typing. */
export function formatDmyInput(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/** 'YYYY-MM-DD' → 'DD-MM-YYYY' (empty string for null/invalid). */
export function isoToDmy(iso: string | null | undefined): string {
  if (!iso || !isValidISODate(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** 'DD-MM-YYYY' → 'YYYY-MM-DD', or null if it isn't a real calendar date. */
export function dmyToIso(dmy: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isValidISODate(iso) ? iso : null;
}
