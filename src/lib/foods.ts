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
  /** 'ai' = estimated by the AI from a description (logged as a manual entry). */
  source: 'usda' | 'off' | 'ai';
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

interface AiItem {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  min_g: number;
  typical_g: number;
  max_g: number;
  unit_name: string;
  unit_g: number;
}

/**
 * AI nutrition estimate for foods described in words ("latte with full fat milk",
 * "2 eggs and a slice of toast"). Uses the planner's AI, which returns per-100 g
 * values, a typical serving and unit weights, and honours amounts given in the text.
 */
export async function estimateFoods(description: string): Promise<FoodResult[]> {
  const { data, error } = await supabase.functions.invoke<{ items: AiItem[]; notes: string }>('plan-day', {
    body: { text: description },
  });
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
    throw new Error(message ?? (error.message || 'The AI estimate failed'));
  }
  return (data?.items ?? []).map((i, n) => {
    const fixedAmount = i.min_g === i.typical_g && i.typical_g === i.max_g;
    const servings: FoodResult['servings'] = [];
    if (i.unit_name && i.unit_g > 0) servings.push({ label: `1 ${i.unit_name}`, grams: round1(i.unit_g) });
    if (i.typical_g > 0) servings.unshift({ label: fixedAmount ? 'As described' : 'Typical serving', grams: round1(i.typical_g) });
    return {
      id: `ai:${n}:${i.name}`,
      source: 'ai' as const,
      ref: '',
      name: i.name,
      brand: null,
      detail: 'AI estimate',
      per100g: { kcal: i.kcal_100g, protein_g: i.protein_100g, carbs_g: i.carbs_100g, fat_g: i.fat_100g },
      servings,
      incomplete: false,
    };
  });
}
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
