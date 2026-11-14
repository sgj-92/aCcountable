// Supabase Edge Function: search foods across USDA FoodData Central (whole /
// generic foods) and Open Food Facts (branded / packaged foods), or look up a
// barcode. Returns normalised per-100 g values.
//
// Secrets (set with `supabase secrets set ...`):
//   USDA_API_KEY      free key from https://api.data.gov/signup (DEMO_KEY otherwise,
//                     which is heavily rate limited and shared)
//   OFF_USER_AGENT    optional; Open Food Facts asks apps to identify themselves,
//                     e.g. "MyApp/1.0 (you@example.com)"

import {
  barcodeVariants,
  dedupe,
  normalizeOffProduct,
  normalizeUsdaFood,
  type FoodResult,
  type OffProduct,
  type UsdaFood,
} from './normalize.ts';

const USDA_KEY = Deno.env.get('USDA_API_KEY') || 'DEMO_KEY';
// api.data.gov accepts the key as a header, which keeps it out of URLs and logs.
const USDA_HEADERS = { 'X-Api-Key': USDA_KEY };
const OFF_UA = Deno.env.get('OFF_USER_AGENT') || 'PersonalNutritionApp/1.0';
const OFF_FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity';
const TIMEOUT_MS = 8000;
const PAGE = 20;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

function usdaUrl(query: string, dataTypes: string) {
  const u = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  u.searchParams.set('query', query);
  u.searchParams.set('dataType', dataTypes);
  u.searchParams.set('pageSize', String(PAGE));
  return u.toString();
}

async function searchUsda(query: string): Promise<FoodResult[]> {
  // Generic foods only: branded products come from Open Food Facts.
  const data = await getJson(usdaUrl(query, 'Foundation,SR Legacy,Survey (FNDDS)'), USDA_HEADERS);
  return ((data.foods ?? []) as UsdaFood[]).map(normalizeUsdaFood).filter((r): r is FoodResult => !!r);
}

async function searchOff(query: string): Promise<FoodResult[]> {
  let hits: OffProduct[];
  try {
    const u = new URL('https://search.openfoodfacts.org/search');
    u.searchParams.set('q', query);
    u.searchParams.set('page_size', String(PAGE));
    u.searchParams.set('fields', OFF_FIELDS);
    hits = (await getJson(u.toString(), { 'User-Agent': OFF_UA })).hits ?? [];
  } catch (e) {
    // Fall back to the classic search endpoint if the newer search service is down.
    console.warn('OFF search service failed, falling back:', e instanceof Error ? e.message : e);
    const u = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    u.searchParams.set('search_terms', query);
    u.searchParams.set('search_simple', '1');
    u.searchParams.set('action', 'process');
    u.searchParams.set('json', '1');
    u.searchParams.set('page_size', String(PAGE));
    u.searchParams.set('fields', OFF_FIELDS);
    hits = (await getJson(u.toString(), { 'User-Agent': OFF_UA })).products ?? [];
  }
  return dedupe(hits.map(normalizeOffProduct).filter((r): r is FoodResult => !!r));
}

async function barcodeOff(code: string): Promise<FoodResult[]> {
  for (const variant of barcodeVariants(code)) {
    const data = await getJson(
      `https://world.openfoodfacts.org/api/v2/product/${variant}?fields=${OFF_FIELDS}`,
      { 'User-Agent': OFF_UA },
    );
    if (data.status === 1 && data.product) {
      const r = normalizeOffProduct({ code: variant, ...data.product });
      if (r) return [r];
    }
  }
  return [];
}

async function barcodeUsda(code: string): Promise<FoodResult[]> {
  for (const variant of barcodeVariants(code)) {
    const data = await getJson(usdaUrl(variant, 'Branded'), USDA_HEADERS);
    const match = ((data.foods ?? []) as (UsdaFood & { gtinUpc?: string })[]).filter((f) =>
      barcodeVariants(variant).includes((f.gtinUpc ?? '').replace(/\D/g, '')),
    );
    const results = match.map(normalizeUsdaFood).filter((r): r is FoodResult => !!r);
    if (results.length) return results.slice(0, 1);
  }
  return [];
}

/** Run both providers; a failure in one still returns the other's results. */
async function both(usda: () => Promise<FoodResult[]>, off: () => Promise<FoodResult[]>) {
  const [u, o] = await Promise.allSettled([usda(), off()]);
  const errors: string[] = [];
  if (u.status === 'rejected') {
    console.error('USDA failed:', u.reason);
    errors.push('USDA search is unavailable right now.');
  }
  if (o.status === 'rejected') {
    console.error('Open Food Facts failed:', o.reason);
    errors.push('Open Food Facts is unavailable right now.');
  }
  return {
    usda: u.status === 'fulfilled' ? u.value : [],
    off: o.status === 'fulfilled' ? o.value : [],
    errors,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // The platform verifies the caller's JWT (verify_jwt = true in config.toml).

  let body: { query?: unknown; barcode?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (typeof body.barcode === 'string') {
    const code = body.barcode.replace(/\D/g, '');
    if (code.length < 8 || code.length > 14) return json({ error: 'That barcode doesn’t look valid.' }, 400);
    return json(await both(() => barcodeUsda(code), () => barcodeOff(code)));
  }

  if (typeof body.query === 'string') {
    const query = body.query.trim().slice(0, 100);
    if (query.length < 2) return json({ error: 'Type at least 2 characters.' }, 400);
    return json(await both(() => searchUsda(query), () => searchOff(query)));
  }

  return json({ error: 'Expected { query } or { barcode }' }, 400);
});
