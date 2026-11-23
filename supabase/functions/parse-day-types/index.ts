// Supabase Edge Function: turn a day plan agreed with a coach ("Padel day:
// 2,400 kcal, 180 g protein. Meal 1: 3 eggs, 50 g oats…") into structured day
// types: targets, assumed training and meals with set portions. Foods are
// matched to the person's pantry where possible so the app can use their
// saved values.
//
// Secrets: ANTHROPIC_API_KEY (required), DAILY_SCAN_LIMIT (optional, shared
// with photo scans and planning, default 60 AI calls per user per day).

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ACTIVITIES, INTENSITIES, MEALS, normalizeDayType, type RawDayType } from './normalize.ts';

const MODEL = 'claude-opus-5-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RequestSchema = z.object({
  text: z.string().trim().min(2).max(6000),
  meals: z
    .array(z.object({ key: z.enum(MEALS), label: z.string().trim().min(1).max(30) }))
    .min(1)
    .max(6),
  pantry: z
    .array(
      z.object({
        name: z.string().max(200),
        kcal_100g: z.number(),
        protein_100g: z.number(),
        carbs_100g: z.number(),
        fat_100g: z.number(),
        portion_g: z.number(),
        unit_name: z.string().nullable().optional(),
      }),
    )
    .max(300)
    .default([]),
  whoop_activities: z.array(z.string().max(80)).max(60).default([]),
});

function outputSchema(mealKeys: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['day_types', 'notes'],
    properties: {
      notes: { type: 'string', description: 'Anything assumed or unclear, in one or two short sentences. Empty if nothing.' },
      day_types: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'sessions', 'meals'],
          properties: {
            name: { type: 'string', description: 'Short name, e.g. "Rest day", "Padel day", "Gym + run".' },
            kcal: { type: 'number' },
            protein_g: { type: 'number' },
            carbs_g: { type: 'number' },
            fat_g: { type: 'number' },
            sessions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['activity', 'whoop_activity', 'duration_min', 'intensity'],
                properties: {
                  activity: { type: 'string', enum: [...ACTIVITIES] },
                  whoop_activity: { type: 'string', description: 'Exact name from my WHOOP activities if one matches, else empty.' },
                  duration_min: { type: 'number' },
                  intensity: { type: 'string', enum: [...INTENSITIES] },
                },
              },
            },
            meals: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['meal', 'food', 'pantry_name', 'grams', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'unit_name', 'unit_g'],
                properties: {
                  meal: { type: 'string', enum: [...mealKeys] },
                  food: { type: 'string' },
                  pantry_name: { type: 'string', description: 'Exact name of the matching pantry food, or empty if none matches.' },
                  grams: { type: 'number', description: 'Agreed portion in grams.' },
                  kcal_100g: { type: 'number' },
                  protein_100g: { type: 'number' },
                  carbs_100g: { type: 'number' },
                  fat_100g: { type: 'number' },
                  unit_name: { type: 'string', description: 'Singular unit for countable foods ("egg"); empty otherwise.' },
                  unit_g: { type: 'number', description: 'Grams per unit for countable foods; 0 otherwise.' },
                },
              },
            },
          },
        },
      },
    },
  } as const;
}

const ResultSchema = z.object({
  notes: z.string(),
  day_types: z.array(
    z.object({
      name: z.string(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      sessions: z.array(z.object({ activity: z.string(), whoop_activity: z.string(), duration_min: z.number(), intensity: z.string() })),
      meals: z.array(
        z.object({
          meal: z.string(),
          food: z.string(),
          pantry_name: z.string(),
          grams: z.number(),
          kcal_100g: z.number(),
          protein_100g: z.number(),
          carbs_100g: z.number(),
          fat_100g: z.number(),
          unit_name: z.string(),
          unit_g: z.number(),
        }),
      ),
    }),
  ),
});

const SYSTEM_PROMPT = `You turn a nutrition plan that someone agreed with their coach into structured "day types" for a calorie-tracking app.

A day type is one kind of day (e.g. "Rest day", "Padel day", "Gym + run day") with:
- kcal, protein_g, carbs_g, fat_g: the day's targets. Use the numbers stated in the plan. If some aren't stated, work them out from the day's meals at their portions (and say so in notes).
- sessions: the training that kind of day assumes (activity, duration, intensity). If one of my WHOOP activities matches, put its exact name in whoop_activity. Rest days have none.
- meals: each food with its agreed portion in grams, under the meal it belongs to (match my meal names, or by order: the first meal of the day is my first meal).

For each food:
- If it matches a food in my pantry (same food, even if worded differently), set pantry_name to the pantry name exactly and copy that pantry food's values per 100 g and unit. Otherwise leave pantry_name empty and give typical values per 100 g for the food as described (raw or cooked as stated; dry weight for rice and pasta unless cooked is stated).
- grams is the agreed portion. Convert counts and household measures ("3 eggs", "1 scoop", "a slice") to grams, and for countable foods set unit_name and unit_g.

If the plan describes the same structure with different portions per day type, create separate day types. Keep names short. Don't invent day types that aren't in the plan.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
  const { count } = await supabase.from('ai_scans').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= limit) return json({ error: `Daily AI limit reached (${limit}). Try again later.` }, 429);

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request: expected { text, meals, pantry?, whoop_activities? }' }, 400);
  }

  const mealKeys = body.meals.map((m) => m.key);
  const mealList = body.meals.map((m, i) => `${i + 1}. "${m.label}" (key: ${m.key})`).join('\n');
  const pantryList = body.pantry.length
    ? body.pantry
        .map(
          (p) =>
            `- ${p.name}: ${p.kcal_100g} kcal, P ${p.protein_100g}, C ${p.carbs_100g}, F ${p.fat_100g} per 100 g; usually ${p.portion_g} g${p.unit_name ? ` (counted in ${p.unit_name}s)` : ''}`,
        )
        .join('\n')
    : '(empty)';
  const userText =
    `My meals, in order:\n${mealList}\n\n` +
    `My pantry:\n${pantryList}\n\n` +
    `My WHOOP activities: ${body.whoop_activities.length ? body.whoop_activities.join(', ') : '(none)'}\n\n` +
    `The plan I agreed with my coach:\n${body.text}`;

  const client = new Anthropic({ apiKey });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: outputSchema(mealKeys) } },
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
  if (response.stop_reason === 'max_tokens') return json({ error: 'The AI response was cut off. Try fewer day types at once.' }, 502);

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

  const dayTypes = parsed.data.day_types
    .map((d) => normalizeDayType(d as RawDayType, mealKeys))
    .filter((d): d is NonNullable<typeof d> => !!d);
  return json({ day_types: dayTypes, notes: parsed.data.notes });
});
