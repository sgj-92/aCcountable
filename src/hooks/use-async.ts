import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal data-loading hook: runs `fn` whenever the screen gains focus and
 * whenever `key` changes while focused (so data edited in a modal shows up on
 * return, and changing the selected day/week refetches).
 */
export function useAsync<T>(fn: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  const requestId = useRef(0);

  // Declared before the focus effect so it always runs first in a commit.
  useEffect(() => {
    fnRef.current = fn;
  });

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Only a pull-to-refresh shows the spinner. Background reloads (e.g. on returning to a tab) must
  // not: on iOS, setting RefreshControl's `refreshing` from code shifts the content down by the
  // spinner's height, and React Native can leave that gap behind once loading ends.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, key]),
  );

  return { data, error, loading, reload, refreshing, refresh };
}
