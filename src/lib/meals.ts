/**
 * Meal slots: up to six fixed keys (stored on each food entry / plan item)
 * with names the person chooses. Keys never change, so renaming a meal
 * relabels past entries too.
 */

export const SLOT_KEYS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'] as const;
export type MealKey = (typeof SLOT_KEYS)[number];

export interface MealSlot {
  key: MealKey;
  label: string;
}

export const MAX_MEALS = SLOT_KEYS.length;
export const MIN_MEALS = 1;

export const CLASSIC_SLOTS: MealSlot[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
];

/** "Meal 1" … "Meal n". */
export function numberedSlots(n: number): MealSlot[] {
  const count = Math.max(MIN_MEALS, Math.min(MAX_MEALS, Math.round(n)));
  return SLOT_KEYS.slice(0, count).map((key, i) => ({ key, label: `Meal ${i + 1}` }));
}

/** Label for a key with no configured slot (e.g. an old entry after reducing the meal count). */
export function fallbackLabel(key: string): string {
  const classic = CLASSIC_SLOTS.find((s) => s.key === key);
  if (classic) return classic.label;
  const idx = SLOT_KEYS.indexOf(key as MealKey);
  return idx >= 0 ? `Meal ${idx + 1}` : 'Other';
}

/** Validates stored slots (jsonb from the profile), falling back to the classic set. */
export function resolveSlots(stored: unknown): MealSlot[] {
  if (!Array.isArray(stored)) return CLASSIC_SLOTS;
  const seen = new Set<string>();
  const out: MealSlot[] = [];
  for (const s of stored) {
    const key = (s as MealSlot)?.key;
    const label = typeof (s as MealSlot)?.label === 'string' ? (s as MealSlot).label.trim() : '';
    if (!(SLOT_KEYS as readonly string[]).includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: label.slice(0, 30) || fallbackLabel(key) });
  }
  return out.length ? out.slice(0, MAX_MEALS) : CLASSIC_SLOTS;
}

/**
 * The slots to display for some data: the configured ones, plus any other
 * keys the data uses (so nothing logged disappears after changing the setup).
 */
export function slotsForData(slots: MealSlot[], usedKeys: string[]): MealSlot[] {
  const extra = [...new Set(usedKeys)]
    .filter((k) => !slots.some((s) => s.key === k))
    .filter((k): k is MealKey => (SLOT_KEYS as readonly string[]).includes(k))
    .sort((a, b) => SLOT_KEYS.indexOf(a) - SLOT_KEYS.indexOf(b))
    .map((key) => ({ key, label: fallbackLabel(key) }));
  return [...slots, ...extra];
}

/** Adds the next unused key as "Meal n". */
export function addSlot(slots: MealSlot[]): MealSlot[] {
  const key = SLOT_KEYS.find((k) => !slots.some((s) => s.key === k));
  if (!key || slots.length >= MAX_MEALS) return slots;
  return [...slots, { key, label: `Meal ${slots.length + 1}` }];
}

/**
 * Which meal something logged now most likely belongs to. Inside a fasting
 * eating window, the window is split evenly across the meals; otherwise it
 * goes by time of day (morning → first meal, midday → second, evening → third,
 * otherwise the last).
 */
export function defaultSlotForNow(
  slots: MealSlot[],
  now: Date,
  window?: { startMin: number; endMin: number } | null,
): MealKey {
  if (slots.length === 0) return 'snack';
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (window) {
    const length = (window.endMin - window.startMin + 1440) % 1440 || 1440;
    const into = (minutes - window.startMin + 1440) % 1440;
    if (into < length) {
      const idx = Math.min(slots.length - 1, Math.floor((into / length) * slots.length));
      return slots[idx].key;
    }
    return slots[slots.length - 1].key;
  }
  const h = now.getHours();
  const pick = (i: number) => slots[Math.min(i, slots.length - 1)].key;
  if (h < 11) return pick(0);
  if (h < 15) return pick(1);
  if (h >= 17 && h < 22) return pick(2);
  return slots[slots.length - 1].key;
}
