/**
 * Suggested meal times for a day, timed around training when its start time is known:
 * a carb-focused meal about 2 h before and a protein-and-carb meal about 1 h after.
 */
export interface MealTime {
  /** Minutes after midnight. */
  minutes: number;
  tag?: 'pre' | 'post';
}

const DAY_START = 7 * 60 + 30;
const DAY_END = 20 * 60 + 30;
const round15 = (m: number) => Math.round(m / 15) * 15;

function spread(from: number, to: number, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [from];
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

/**
 * @param training sessions with a start time (minutes after midnight) and duration; the longest one is used
 * @param window   eating window, if fasting
 */
export function mealTimes(
  slots: { key: string }[],
  training: { startMin: number; durationMin: number }[],
  window: { startMin: number; endMin: number } | null,
): Record<string, MealTime> {
  const start = window?.startMin ?? DAY_START;
  const end = window ? (window.endMin > window.startMin ? window.endMin : window.endMin + 1440) : DAY_END;
  const n = slots.length;
  let times = spread(start, end, n);
  const tags: (MealTime['tag'] | undefined)[] = slots.map(() => undefined);

  const main = training.slice().sort((x, y) => y.durationMin - x.durationMin)[0];
  if (main && n > 0) {
    const s = main.startMin;
    const finish = s + main.durationMin;
    const gap = n > 1 ? (end - start) / (n - 1) : end - start;
    const postAt = window ? Math.min(end, finish + 60) : finish + 60;
    // Training before the day starts: every meal comes after it.
    const early = s - 60 < start;
    // How many meals fit after training, given how much of the day is left.
    const after = early ? n : Math.min(n, Math.max(1, Math.floor((end - postAt) / gap) + 1));
    const post = n - after;
    const pre = early ? -1 : post - 1;

    const next = [...times];
    if (pre >= 0) {
      const preAt = Math.max(start, s - 120);
      next[pre] = preAt;
      tags[pre] = 'pre';
      spread(start, Math.max(start, preAt - 150), pre).forEach((t, i) => (next[i] = t));
    }
    next[post] = postAt;
    tags[post] = 'post';
    const rest = n - post - 1;
    spread(postAt, Math.max(end, postAt + 150 * rest), rest + 1)
      .slice(1)
      .forEach((t, i) => (next[post + 1 + i] = t));
    times = next;
  }

  return Object.fromEntries(
    slots.map((s, i) => [s.key, { minutes: ((round15(times[i]) % 1440) + 1440) % 1440, ...(tags[i] ? { tag: tags[i] } : {}) }]),
  );
}
