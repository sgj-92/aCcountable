import { useEffect } from 'react';

import { updateProfile, type Profile } from '@/lib/api';
import type { WeekView } from '@/lib/adaptive';
import { today } from '@/lib/dates';

// One attempt per app session at most (e.g. if the database doesn't have the column yet).
let attempted = false;

/**
 * Applies the weigh-in correction by itself when it's due (at most a ±150 kcal/day step a week),
 * so actual loss keeps tracking the goal however much the training estimates are off.
 */
export function useAutoCorrect(profile: Profile | undefined, view: WeekView | null | undefined, onApplied: () => void) {
  const next = view?.burn.auto ?? null;
  useEffect(() => {
    if (!profile || next == null || attempted) return;
    attempted = true;
    updateProfile(profile.id, { maintenance_adjust_kcal: next, maintenance_adjusted_on: today() })
      .then(onApplied)
      .catch(() => {});
    // onApplied is a reload callback; only a new value should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, next]);
}
