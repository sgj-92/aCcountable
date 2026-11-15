import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getProfile, type Profile } from '@/lib/api';
import { parseClock } from '@/lib/fasting';
import { CLASSIC_SLOTS, resolveSlots, type MealSlot } from '@/lib/meals';

import { useAuth } from './use-auth';

interface ProfileState {
  profile: Profile | null;
  /** Re-read the profile (call after saving settings). */
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileState>({ profile: null, reload: async () => {} });

/** Keeps the signed-in person's profile available app-wide (meal names, fasting window). */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  const reload = useCallback(async () => {
    try {
      setProfile(await getProfile());
    } catch {
      // Screens that need the profile load and report errors themselves.
    }
  }, []);

  // Forget the previous person's profile as soon as the signed-in user changes.
  const userId = session?.user.id;
  const [profileFor, setProfileFor] = useState(userId);
  if (profileFor !== userId) {
    setProfileFor(userId);
    setProfile(null);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getProfile().then(
      (p) => {
        if (!cancelled) setProfile(p);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <ProfileContext.Provider value={{ profile, reload }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

/** The meals in display order, with the person's names. */
export function useMealSlots(): MealSlot[] {
  const { profile } = useContext(ProfileContext);
  return profile ? resolveSlots(profile.meal_slots) : CLASSIC_SLOTS;
}

/** The eating window in minutes after midnight, or null when not fasting. */
export function useFastingWindow(): { startMin: number; endMin: number } | null {
  const { profile } = useContext(ProfileContext);
  const startMin = parseClock(profile?.eating_window_start);
  const endMin = parseClock(profile?.eating_window_end);
  return startMin != null && endMin != null ? { startMin, endMin } : null;
}
