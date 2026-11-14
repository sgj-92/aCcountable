// Supabase Edge Function: analyse a meal photo with Claude and return
// per-item calorie + macro estimates as validated JSON.
//
// Secrets (set with `supabase secrets set ...`):
//   ANTHROPIC_API_KEY   required
//   DAILY_SCAN_LIMIT    optional, default 60 scans per user per day
// SUPABASE_URL / SUPABASE_ANON_KEY are injected by the platform.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const MODEL = 'claude-opus-5-5';
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ~5 MB decoded

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RequestSchema = z.object({
  imageBase64: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  note: z.string().max(500).optional(),
});

// JSON Schema handed to Claude's structured outputs, so the reply is always parseable.
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_food', 'meal_name', 'items', 'notes'],
  properties: {
    is_food: {
      type: 'boolean',
      description: 'False if the photo does not show food or drink.',
    },
    meal_name: { type: 'string', description: 'Short name for the whole meal, e.g. "Chicken burrito bowl".' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'portion', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
        properties: {
          name: { type: 'string' },
          portion: { type: 'string', description: 'Human-readable portion, e.g. "1 cup", "2 slices".' },
          grams: { type: 'number', description: 'Estimated edible weight in grams.' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    notes: {
      type: 'string',
      description: 'One or two sentences on key assumptions (hidden oils, sauces, portion cues). Empty if none.',
    },
  },
} as const;

// Validate the model output too: belt and braces before it reaches the app.
const ResultSchema = z.object({
  is_food: z.boolean(),
  meal_name: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string(),
      grams: z.number().nonnegative(),
      kcal: z.number().nonnegative(),
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
      confidence: z.enum(['low', 'medium', 'high']),
    }),
  ),
  notes: z.string(),
});

const SYSTEM_PROMPT = `You are a sports nutritionist estimating the nutrition of a meal from a photo for a calorie-tracking app used by an athlete. The user will review and edit your numbers, so give your single best estimate rather than ranges.

How to estimate:
- Identify each distinct food or drink separately (e.g. rice, chicken, sauce, side salad) so the user can adjust items individually.
- Judge portion size from visual cues: plate or bowl diameter (a dinner plate is typically 26-28 cm), cutlery, hands, packaging and food thickness. State the portion in everyday units and give an estimated edible weight in grams.
- Account for what is easy to miss: cooking oil and butter, dressings, sauces, cheese, sugary drinks. If something is likely but not visible (e.g. oil in a stir-fry), include it as its own item and say so in notes.
- Base calories and macros on standard nutrition references for the food as prepared. Keep each item's kcal consistent with its macros (protein 4, carbs 4, fat 9 kcal per gram, allowing for fibre and alcohol).
- If packaging with a nutrition label is visible, use the label values.
- Confidence: "high" when the food and portion are clear, "medium" for typical uncertainty, "low" when the item or amount is largely guessed.
- If the user adds a note (e.g. weights, ingredients, "I ate half"), treat it as more reliable than the photo.
- If the image does not contain food or drink, set is_food to false and return an empty items list.`;

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

  // Identify the caller from their Supabase session token.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);
  const userId = userData.user.id;

  // Daily cap, counted from this user's own usage rows (RLS-scoped).
  const limit = Number(Deno.env.get('DAILY_SCAN_LIMIT') ?? '60');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ai_scans')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if ((count ?? 0) >= limit) {
    return json({ error: `Daily scan limit reached (${limit}). Add the meal manually or try later.` }, 429);
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request: expected { imageBase64, mediaType?, note? }' }, 400);
  }

  const client = new Anthropic({ apiKey });
  const userText = body.note?.trim()
    ? `Estimate the nutrition of this meal. Note from me: ${body.note.trim()}`
    : 'Estimate the nutrition of this meal.';

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, the API retries on a fallback model automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Opus 5.5 defaults to medium effort; set explicitly. Raise to "high" for
      // more careful estimates, lower to "low" for faster scans.
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: body.mediaType, data: body.imageBase64 } },
            { type: 'text', text: userText },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: 'The AI service is busy. Try again in a moment.' }, 503);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic auth failed — check ANTHROPIC_API_KEY');
      return json({ error: 'AI service is misconfigured' }, 500);
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error('Anthropic rejected request:', err.message);
      return json({ error: 'The photo could not be processed. Try a smaller or clearer image.' }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
      return json({ error: 'AI service error. Try again.' }, 502);
    }
    console.error('Unexpected error calling Anthropic:', err);
    return json({ error: 'AI service unreachable. Try again.' }, 502);
  }

  // Record usage (best effort: a logging failure shouldn't lose the user's result).
  const { error: logError } = await supabase.from('ai_scans').insert({
    user_id: userId,
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });
  if (logError) console.error('Failed to log scan usage:', logError.message);

  if (response.stop_reason === 'refusal') {
    return json({ error: 'The AI declined to analyse this image. Please log it manually.' }, 422);
  }
  if (response.stop_reason === 'max_tokens') {
    return json({ error: 'The AI response was cut off. Try again.' }, 502);
  }

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return json({ error: 'Empty AI response. Try again.' }, 502);

  let raw: unknown;
  try {
    raw = JSON.parse(text.text);
  } catch {
    console.error('AI output was not valid JSON');
    return json({ error: 'Unexpected AI response. Try again.' }, 502);
  }
  const parsed = ResultSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Unexpected AI output shape:', parsed.error.message);
    return json({ error: 'Unexpected AI response. Try again.' }, 502);
  }

  return json({ ...parsed.data, model: response.model });
});
