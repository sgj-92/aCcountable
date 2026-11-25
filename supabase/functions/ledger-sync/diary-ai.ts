// Calories for food typed in Ledger ("2 eggs and toast"): one Claude call for all the
// day's new lines, each line becoming one food entry with the totals for that line.

import Anthropic from '@anthropic-ai/sdk';

import { normalizeDiaryFood, type DiaryAdd, type DiaryFood } from './logic.ts';

const MODEL = 'claude-opus-5-5';

const SYSTEM_PROMPT = `You estimate the nutrition of food a person typed quickly into their day planner ("2 eggs and toast", "chicken wrap from Pret", "protein shake"). The lines go into their calorie-tracking app as food entries. They are an active adult in the UK who is losing weight while training.

For each line, return exactly one entry with the totals for everything on that line:
- ref: the line's ref, exactly as given.
- meal: the key of the meal it belongs to, from the person's meals. Use the meal the line names ("lunch:", "breakfast", "after padel"), then what the food suggests, then the time it was added when given; if nothing tells you, use the last meal in the list.
- name: the line as a short, tidy food name in the person's own words (fix obvious typos and capitalisation, keep brands and quantities), e.g. "2 eggs and toast".
- serving: one short phrase with the amounts you assumed, e.g. "2 large eggs, scrambled · 1 slice wholemeal toast with butter".
- kcal, protein_g, carbs_g, fat_g: totals for the whole line, from standard references (USDA FoodData Central, UK supermarket and chain labels when a product or shop is named). Keep kcal consistent with the macros (4/4/9 kcal per gram, allowing for fibre and alcohol). Assume typical UK portions and preparation when amounts aren't given, including likely butter, oil or sauce.
- grams: total weight eaten, or 0 if it can't sensibly be weighed (e.g. a meal deal).
- confidence: "high" when amounts and foods are clear, "medium" for typical portions of common foods, "low" for vague lines.

If a line isn't food or drink, still return it with zeros and confidence "low". Water, black coffee and plain tea are 0 kcal.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'meal', 'name', 'serving', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'grams', 'confidence'],
        properties: {
          ref: { type: 'string' },
          meal: { type: 'string' },
          name: { type: 'string' },
          serving: { type: 'string' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          grams: { type: 'number' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
} as const;

export interface DiaryEstimate {
  foods: DiaryFood[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function estimateDiary(
  apiKey: string,
  lines: DiaryAdd[],
  meals: { key: string; label: string }[],
  addedAt: string | null,
): Promise<DiaryEstimate> {
  const mealKeys = meals.map((m) => m.key);
  const schema = {
    ...OUTPUT_SCHEMA,
    properties: {
      entries: {
        ...OUTPUT_SCHEMA.properties.entries,
        items: {
          ...OUTPUT_SCHEMA.properties.entries.items,
          properties: { ...OUTPUT_SCHEMA.properties.entries.items.properties, meal: { type: 'string', enum: mealKeys } },
        },
      },
    },
  };
  const userText =
    `My meals, in order:\n${meals.map((m, i) => `${i + 1}. "${m.label}" (key: ${m.key})`).join('\n')}\n\n` +
    (addedAt ? `These were added at ${addedAt} today.\n\n` : 'These were added for a past day; the time is unknown.\n\n') +
    `Lines:\n${lines.map((l) => JSON.stringify({ ref: l.ref, text: l.text })).join('\n')}`;

  const client = new Anthropic({ apiKey });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Recalling typical portions and nutrition values doesn't need deep reasoning.
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The AI declined these lines');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Empty AI response');
  const raw = JSON.parse(text.text) as { entries?: Record<string, unknown>[] };
  const foods = (raw.entries ?? [])
    .map((e) => normalizeDiaryFood(e, lines, mealKeys))
    .filter((f): f is DiaryFood => !!f);
  return {
    foods,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
