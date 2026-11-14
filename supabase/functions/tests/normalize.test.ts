// Run with: deno test --allow-read supabase/functions/tests/
// Fixtures are trimmed copies of real API responses.
import { assert, assertEquals } from 'jsr:@std/assert@1';

import {
  barcodeVariants,
  dedupe,
  normalizeOffProduct,
  normalizeUsdaFood,
  tidyName,
  type FoodResult,
} from '../food-search/normalize.ts';

const load = async (name: string) =>
  JSON.parse(await Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url)));

Deno.test('USDA Foundation food uses Atwater energy when 1008 is absent', async () => {
  const { foods } = await load('usda-search-chicken.json');
  const r = normalizeUsdaFood(foods[0])!;
  assertEquals(r.name, 'Chicken, breast, boneless, skinless, raw');
  assertEquals(r.detail, 'USDA · lab analysed');
  assertEquals(r.per100g, { kcal: 112, protein_g: 22.5, carbs_g: 0, fat_g: 1.9 });
  assertEquals(r.incomplete, false);
  assertEquals(r.id, 'usda:2646170');
});

Deno.test('USDA negative carbohydrate-by-difference is clamped to 0', async () => {
  const { foods } = await load('usda-search-chicken.json');
  const r = normalizeUsdaFood(foods[1])!;
  assertEquals(r.per100g.carbs_g, 0);
});

Deno.test('USDA SR Legacy uses the kcal value, not kJ', async () => {
  const { foods } = await load('usda-search-chicken.json');
  const r = normalizeUsdaFood(foods[2])!;
  assertEquals(r.per100g.kcal, 172);
  assertEquals(r.detail, 'USDA · standard reference');
});

Deno.test('USDA FNDDS portions become servings, skipping "Quantity not specified"', async () => {
  const { foods } = await load('usda-search-chicken.json');
  const r = normalizeUsdaFood(foods[3])!;
  assertEquals(r.detail, 'USDA · as eaten');
  assert(r.servings.length > 0);
  assert(r.servings.every((s) => !/quantity not specified/i.test(s.label) && s.grams > 0));
});

Deno.test('USDA branded: tidies ALL CAPS names and ignores non-gram serving units', async () => {
  const { foods } = await load('usda-branded.json');
  const r = normalizeUsdaFood(foods[0])!;
  assertEquals(r.name, 'Oreo Cereal, Oreo');
  assertEquals(r.per100g.kcal, 400);
  assertEquals(r.servings, []); // fixture says 30 "MG", which is clearly not a real serving
});

Deno.test('Open Food Facts product (string brands, energy-kcal)', async () => {
  const { product } = await load('off-product-nutella.json');
  const r = normalizeOffProduct(product)!;
  assertEquals(r.name, 'Nutella');
  assertEquals(r.brand, 'Ferrero, Nutella');
  assertEquals(r.per100g, { kcal: 539, protein_g: 6.3, carbs_g: 57.5, fat_g: 30.9 });
  assertEquals(r.id, 'off:3017620422003');
});

Deno.test('Open Food Facts search hits (array brands, missing macros, float noise)', async () => {
  const { hits } = await load('off-search-fage.json');
  const results = hits.map(normalizeOffProduct).filter(Boolean) as FoodResult[];
  // Hit #2 has no nutriments at all, so it is dropped.
  assertEquals(results.length, 2);
  const [noBrand, full] = results;
  assertEquals(noBrand.brand, null);
  assertEquals(noBrand.per100g.protein_g, 10.3);
  assertEquals(noBrand.incomplete, true); // no fat value
  assertEquals(full.brand, 'Fage');
  assertEquals(full.incomplete, false);
});

Deno.test('Open Food Facts: kJ-only energy is converted to kcal, serving parsed', () => {
  const r = normalizeOffProduct({
    code: '123',
    product_name: 'Test bar',
    serving_size: '50 g',
    serving_quantity: '50',
    nutriments: { energy_100g: 2000, proteins_100g: 10, carbohydrates_100g: 50, fat_100g: 25 },
  })!;
  assertEquals(r.per100g.kcal, 478);
  assertEquals(r.servings, [{ label: '50 g', grams: 50 }]);
});

Deno.test('dedupe and helpers', () => {
  const a = normalizeOffProduct({ code: '1', product_name: 'Oats', nutriments: { 'energy-kcal_100g': 370 } })!;
  const b = normalizeOffProduct({ code: '2', product_name: 'oats', nutriments: { 'energy-kcal_100g': 370 } })!;
  assertEquals(dedupe([a, b]).length, 1);
  assertEquals(tidyName('Greek yogurt'), 'Greek yogurt');
  assertEquals(barcodeVariants('0038000138416'), ['0038000138416', '038000138416']);
  assertEquals(barcodeVariants('038000138416'), ['038000138416', '0038000138416']);
});
