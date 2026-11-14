import { FunctionsHttpError } from '@supabase/supabase-js';

import type { FoodEntry } from './api';
import { supabase } from './supabase';

/** Mirrors FoodResult in supabase/functions/food-search/normalize.ts. */
export interface Per100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FoodResult {
  id: string;
  source: 'usda' | 'off';
  ref: string;
  name: string;
  brand: string | null;
  detail: string;
  per100g: Per100g;
  servings: { label: string; grams: number }[];
  incomplete: boolean;
}

export interface FoodSearchResponse {
  usda: FoodResult[];
  off: FoodResult[];
  errors: string[];
}

async function invoke(body: { query?: string; barcode?: string }): Promise<FoodSearchResponse> {
  const { data, error } = await supabase.functions.invoke<FoodSearchResponse>('food-search', { body });
  if (error) {
    let message: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const b = await error.context.json();
        if (typeof b?.error === 'string') message = b.error;
      } catch {
        // non-JSON body
      }
    }
    throw new Error(message ?? (error.message || 'Food search failed'));
  }
  if (!data) throw new Error('Food search returned nothing');
  return data;
}

export const searchFoods = (query: string) => invoke({ query });
export const lookupBarcode = (barcode: string) => invoke({ barcode });

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Values for `grams` of a food given per-100 g values. */
export function scale(per100g: Per100g, grams: number) {
  const f = Math.max(0, grams) / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein_g: round1(per100g.protein_g * f),
    carbs_g: round1(per100g.carbs_g * f),
    fat_g: round1(per100g.fat_g * f),
  };
}

/** Per-100 g values implied by a weighed log entry (so it can be re-weighed). */
export function per100gFromEntry(e: Pick<FoodEntry, 'grams' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>): Per100g | null {
  if (!e.grams || e.grams <= 0) return null;
  const k = 100 / e.grams;
  return {
    kcal: e.kcal * k,
    protein_g: e.protein_g * k,
    carbs_g: e.carbs_g * k,
    fat_g: e.fat_g * k,
  };
}
