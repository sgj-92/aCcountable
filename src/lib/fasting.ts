/**
 * Intermittent fasting: an eating window given as start/end clock times
 * ("12:00"–"20:00"). Windows may cross midnight ("20:00"–"02:00").
 */

export interface FastingPreset {
  id: string;
  label: string;
  /** Hours of eating window. */
  windowHours: number;
}

export const FASTING_PRESETS: FastingPreset[] = [
  { id: '14:10', label: '14:10', windowHours: 10 },
  { id: '16:8', label: '16:8', windowHours: 8 },
  { id: '18:6', label: '18:6', windowHours: 6 },
  { id: '20:4', label: '20:4', windowHours: 4 },
  { id: 'omad', label: 'OMAD', windowHours: 1 },
];

/** "HH:MM" (or Postgres "HH:MM:SS") → minutes after midnight; null if invalid. */
export function parseClock(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Formats typed digits as HH:MM, inserting the colon itself. */
export function formatClockInput(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** "3h 12m", "45m". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export interface FastingStatus {
  state: 'eating' | 'fasting';
  /** Minutes until the state changes. */
  minutesLeft: number;
  /** Minutes spent in the current state so far. */
  elapsed: number;
  /** Length of the current state in minutes. */
  total: number;
  /** Clock time (minutes after midnight) when the state changes. */
  changesAt: number;
}

export function fastingStatus(now: Date, startMin: number, endMin: number): FastingStatus {
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const windowLen = (endMin - startMin + 1440) % 1440 || 1440;
  const fastLen = 1440 - windowLen;
  const intoWindow = (nowMin - startMin + 1440) % 1440;
  if (intoWindow < windowLen) {
    return {
      state: 'eating',
      elapsed: intoWindow,
      total: windowLen,
      minutesLeft: windowLen - intoWindow,
      changesAt: endMin,
    };
  }
  const intoFast = intoWindow - windowLen;
  return {
    state: 'fasting',
    elapsed: intoFast,
    total: fastLen,
    minutesLeft: fastLen - intoFast,
    changesAt: startMin,
  };
}
