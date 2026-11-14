import { describe, expect, it, jest } from '@jest/globals';

import { per100gFromEntry, scale } from '../foods';

// Hoisted above the import by Jest; keeps the Supabase client out of the test.
jest.mock('../supabase', () => ({ supabase: {} }));

describe('scale', () => {
  it('scales per-100 g values to the weighed amount', () => {
    // USDA: chicken breast, boneless, skinless, raw
    expect(scale({ kcal: 112, protein_g: 22.5, carbs_g: 0, fat_g: 1.9 }, 185)).toEqual({
      kcal: 207,
      protein_g: 41.6,
      carbs_g: 0,
      fat_g: 3.5,
    });
  });

  it('treats negative weights as zero', () => {
    expect(scale({ kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 1 }, -5).kcal).toBe(0);
  });
});

describe('per100gFromEntry', () => {
  it('recovers per-100 g values so a logged food can be re-weighed', () => {
    const per100 = per100gFromEntry({ grams: 170, kcal: 92, protein_g: 17.5, carbs_g: 5.1, fat_g: 0 })!;
    expect(per100.kcal).toBeCloseTo(54.1, 1);
    expect(scale(per100, 170).kcal).toBe(92);
    expect(scale(per100, 250).protein_g).toBeCloseTo(25.7, 1);
  });

  it('returns null without a weight', () => {
    expect(per100gFromEntry({ grams: null, kcal: 100, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBeNull();
  });
});
