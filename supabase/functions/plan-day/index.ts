// Supabase Edge Function: turn a free-text list of what someone plans to eat
// into structured foods with nutrition per 100 g and realistic portion ranges.
// The app's solver (src/lib/planner.ts) then calculates the gram amounts that
// hit the day's targets, so Claude never has to do the arithmetic.
//
// Secrets: ANTHROPIC_API_KEY (required), DAILY_SCAN_LIMIT (optional, shared
// with photo scans, default 60 AI calls per user per day).

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { MEALS, normalizePlanItem, type PlanItem, type RawPlanItem } from './normalize.ts';

const MODEL = 'claude-opus-5-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RequestSchema = z.object({
  text: z.string().trim().min(2).max(2000),
  targets: z
    .object({
      kcal: z.number().nonnegative(),
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
    })
    .optional(),
});

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'notes'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'meal',
          'name',
          'kcal_100g',
          'protein_100g',
          'carbs_100g',
          'fat_100g',
          'min_g',
          'typical_g',
          'max_g',
          'unit_name',
          'unit_g',
        ],
        properties: {
          meal: { type: 'string', enum: [...MEALS] },
          name: { type: 'string', description: 'Food name including the weighing basis, e.g. "Basmati rice (dry)".' },
          kcal_100g: { type: 'number' },
          protein_100g: { type: 'number' },
          carbs_100g: { type: 'number' },
          fat_100g: { type: 'number' },
          min_g: { type: 'number' },
          typical_g: { type: 'number' },
          max_g: { type: 'number' },
          unit_name: { type: 'string', description: 'Singular unit for countable foods ("egg", "slice"); empty otherwise.' },
          unit_g: { type: 'number', description: 'Grams per unit for countable foods; 0 otherwise.' },
        },
      },
    },
    notes: { type: 'string', description: 'One short sentence on any assumption the person should check; empty if none.' },
  },
} as const;

const ResultSchema = z.object({
  items: z.array(
    z.object({
      meal: z.string(),
      name: z.string(),
      kcal_100g: z.number(),
      protein_100g: z.number(),
      carbs_100g: z.number(),
      fat_100g: z.number(),
      min_g: z.number(),
      typical_g: z.number(),
      max_g: z.number(),
      unit_name: z.string(),
      unit_g: z.number(),
    }),
  ),
  notes: z.string(),
});

const SYSTEM_PROMPT = `You turn a person's free-text list of what they plan to eat today into structured foods for a nutrition app used by an athlete who weighs their food. The app calculates the exact gram amounts that hit their calorie and macro targets, so you do not choose amounts. Your job is accurate nutrition per 100 g and a realistic portion range for each food.

For each distinct food:
- meal: keep the meal the person wrote it under. If they didn't say, infer it from the food and the order (e.g. oats → breakfast).
- name: a clear name that includes the weighing basis, e.g. "Chicken breast, skinless (raw)", "Basmati rice (dry)", "Rolled oats (dry)". People who weigh food usually weigh meat, fish and grains raw or dry, so default to that unless they say "cooked". Keep any brand they mention.
- Nutrition per 100 g of the food in that state, from standard references such as USDA FoodData Central. If they name a specific product (e.g. "Fage Total 0%", "Myprotein Impact Whey"), use that product's label values if you know them. Keep kcal consistent with the macros (protein 4, carbs 4, fat 9 kcal per gram, allowing for fibre and alcohol).
- min_g, typical_g, max_g: a sensible range for one serving of that food at that meal for an active adult. Make max_g generous enough that the day's targets are reachable with the foods listed, but keep it something a person would actually eat. Use small ranges for oils, butter, nut butters, sauces and sweeteners (e.g. olive oil 3 to 20 g). If they gave an amount ("2 eggs", "30 g whey", "1 scoop"), set min_g, typical_g and max_g all to that amount in grams.
- unit_name and unit_g: for foods eaten in whole units (eggs, slices of bread, wraps, bananas, scoops, bars), the singular unit name and the weight of one unit in grams. Otherwise an empty string and 0.

Ignore anything that isn't food or drink. Water, black coffee and plain tea can be left out. If there is no food at all, return an empty list.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Server is missing ANTHROPIC_API_KEY' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);

  const limit = Number(Deno.env.get('DAILY_SCAN_LIMIT') ?? '60');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_scans')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if ((count ?? 0) >= limit) {
    return json({ error: `Daily AI limit reached (${limit}). Try again later.` }, 429);
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request: expected { text, targets? }' }, 400);
  }

  const t = body.targets;
  const userText =
    (t
      ? `Today's targets: ${Math.round(t.kcal)} kcal, ${Math.round(t.protein_g)} g protein, ${Math.round(t.carbs_g)} g carbs, ${Math.round(t.fat_g)} g fat.\n\n`
      : '') + `What I'm eating today:\n${body.text}`;

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Parsing a food list and recalling nutrition values doesn't need deep reasoning.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userText }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'The AI service is busy. Try again in a moment.' }, 503);
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic auth failed — check ANTHROPIC_API_KEY');
      return json({ error: 'AI service is misconfigured' }, 500);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
      return json({ error: 'AI service error. Try again.' }, 502);
    }
    console.error('Unexpected error calling Anthropic:', err);
    return json({ error: 'AI service unreachable. Try again.' }, 502);
  }

  const { error: logError } = await supabase.from('ai_scans').insert({
    user_id: userData.user.id,
    model: response.model,
    kind: 'plan',
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  if (logError) console.error('Failed to log AI usage:', logError.message);

  if (response.stop_reason === 'refusal') return json({ error: 'The AI declined this request.' }, 422);
  if (response.stop_reason === 'max_tokens') return json({ error: 'The AI response was cut off. Try a shorter list.' }, 502);

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return json({ error: 'Empty AI response. Try again.' }, 502);
  let raw: unknown;
  try {
    raw = JSON.parse(text.text);
  } catch {
    return json({ error: 'Unexpected AI response. Try again.' }, 502);
  }
  const parsed = ResultSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Unexpected AI output shape:', parsed.error.message);
    return json({ error: 'Unexpected AI response. Try again.' }, 502);
  }

  const items: PlanItem[] = parsed.data.items
    .map((i) => normalizePlanItem(i as RawPlanItem))
    .filter((i): i is PlanItem => !!i);
  return json({ items, notes: parsed.data.notes });
});
