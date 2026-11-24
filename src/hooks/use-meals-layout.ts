import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type MealsLayout = 'timeline' | 'cards';
const KEY = 'today-meals-layout';

/** How Today shows meals: a timeline (default) or one card per meal. Remembered on this device. */
export function useMealsLayout(): [MealsLayout, (l: MealsLayout) => void] {
  const [layout, setLayout] = useState<MealsLayout>('timeline');
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'timeline' || v === 'cards') setLayout(v);
      })
      .catch(() => {});
  }, []);
  const set = (l: MealsLayout) => {
    setLayout(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  };
  return [layout, set];
}
