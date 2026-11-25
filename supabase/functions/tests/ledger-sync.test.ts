import { assert, assertEquals } from 'jsr:@std/assert@1';

import { newDiary, normalizeDiaryFood, planInbound, sign, verify, withDiary, type Inbound, type Session } from '../ledger-sync/logic.ts';

const date = '2026-11-24';
const base: Inbound = { v: 1, origin: 'ledger', date, training: [], mealsDone: [], weightKg: null };
const mine: Session = { id: 's1', date, activity: 'padel', duration_min: 90, actual_duration_min: null, actual_kcal: null, start_time: '18:00:00', external_ref: null };
const theirs: Session = { id: 's2', date, activity: 'strength', duration_min: 45, actual_duration_min: null, actual_kcal: null, start_time: '07:00', external_ref: 'ledger:2026-11-24:resistance' };

Deno.test('ledger sync: signatures verify and expire', async () => {
  const body = '{"a":1}';
  const now = Date.now();
  const sig = await sign('secret', String(now), body);
  assert(await verify('secret', String(now), sig, body, now));
  assert(await verify('secret', String(now), `sha256=${sig}`, body, now));
  assert(!(await verify('other', String(now), sig, body, now)));
  assert(!(await verify('secret', String(now), sig, '{"a":2}', now)));
  assert(!(await verify('secret', String(now - 10 * 60 * 1000), sig, body, now)));
});

Deno.test('ledger sync: the echo of what we sent changes nothing', () => {
  const c = planInbound(
    { ...base, training: [{ ref: 'acc:session:s1', type: 'padel', startTime: '18:00', durationMin: 90 }, { ref: theirs.external_ref!, type: 'resistance', startTime: '07:00', durationMin: 45 }], weightKg: 98.3 },
    [mine, theirs],
    98.3,
    [],
  );
  assertEquals(c, { insert: [], update: [], remove: [], weightKg: null, log: [] });
});

Deno.test('ledger sync: Ledger adds, edits and removes its sessions; edits ours', () => {
  const c = planInbound(
    { ...base, training: [{ ref: 'acc:session:s1', type: 'padel', startTime: '19:00', durationMin: 60 }, { ref: 'ledger:2026-11-24:yoga', type: 'yoga', startTime: null, durationMin: 30 }] },
    [mine, theirs],
    null,
    [],
  );
  assertEquals(c.update, [{ id: 's1', patch: { start_time: '19:00', duration_min: 60 } }]);
  assertEquals(c.insert, [{ activity: 'yoga', duration_min: 30, start_time: null, external_ref: 'ledger:2026-11-24:yoga' }]);
  assertEquals(c.remove, ['s2']);
});

Deno.test('ledger sync: never deletes our sessions or confirmed ones', () => {
  const c = planInbound(base, [mine, { ...theirs, actual_kcal: 400 }], null, []);
  assertEquals(c.remove, []);
});

Deno.test('ledger sync: weight and meals ticked done', () => {
  const c = planInbound(
    { ...base, weightKg: 98.0, mealsDone: ['acc:meal:2026-11-24:lunch', 'acc:meal:2026-11-24:unknown'] },
    [],
    98.3,
    [{ ref: 'acc:meal:2026-11-24:lunch', planned: [{ planItemId: 'p1', grams: 120 }] }],
  );
  assertEquals(c.weightKg, 98);
  assertEquals(c.log, [{ planItemId: 'p1', grams: 120 }]);
});

// ───────────── food added in Ledger ─────────────

Deno.test('diaryAdded: well-formed refs for the day, each once, skipping ones already logged', () => {
  const date = '2026-11-25';
  const out = newDiary(
    [
      { ref: `ledger:diary:${date}:a1`, text: '  2 eggs   and toast ' },
      { ref: `ledger:diary:${date}:a1`, text: 'duplicate' },
      { ref: `ledger:diary:${date}:b2`, text: 'banana' },
      { ref: `ledger:diary:2026-11-24:c3`, text: 'other day' },
      { ref: 'acc:meal:x', text: 'wrong kind' },
      { ref: `ledger:diary:${date}:d4`, text: '   ' },
      'junk',
    ],
    date,
    new Set([`ledger:diary:${date}:b2`]),
  );
  assertEquals(out, [{ ref: `ledger:diary:${date}:a1`, text: '2 eggs and toast' }]);
  assertEquals(newDiary(undefined, date, new Set()), []);
});

Deno.test('diaryAdded: the AI estimate is made safe to store', () => {
  const lines = [{ ref: 'ledger:diary:2026-11-25:a1', text: '2 eggs and toast' }];
  const f = normalizeDiaryFood(
    { ref: lines[0].ref, meal: 'lunch', name: '2 eggs and <b>toast</b>', serving: '2 large eggs, 1 slice', kcal: 310.4, protein_g: 18.26, carbs_g: -3, fat_g: 17, grams: 0, confidence: 'medium' },
    lines,
    ['breakfast', 'lunch', 'dinner', 'snack'],
  )!;
  assertEquals(f.name, '2 eggs and btoast/b');
  assertEquals([f.kcal, f.protein_g, f.carbs_g, f.grams, f.meal, f.confidence], [310, 18.3, 0, null, 'lunch', 'medium']);
  // An unknown meal goes to the last one; a ref that wasn't sent is dropped.
  assertEquals(normalizeDiaryFood({ ref: lines[0].ref, meal: 'brunch', kcal: 1 }, lines, ['breakfast', 'snack'])!.meal, 'snack');
  assertEquals(normalizeDiaryFood({ ref: 'ledger:diary:2026-11-25:zz' }, lines, ['snack']), null);
});

Deno.test('diaryAdded: the day sent to Ledger gains the foods in their meal, the totals and the diary', () => {
  const last = {
    v: 1,
    origin: 'accountable',
    date: '2026-11-25',
    meals: [{ ref: 'acc:meal:2026-11-25:breakfast', name: 'Meal 1', time: null, tag: null, kcal: 143, done: true, foods: [{ name: 'Eggs', amount: '100 g', kcal: 143, done: true }], planned: [] }],
    nutrition: { eatenKcal: 143, proteinG: 13, carbsG: 1, fatG: 10, targetKcal: 2400, targetProteinG: 180, targetCarbsG: 270, targetFatG: 67, dayType: null, diaryOnly: false, diary: ['Meal 1: Eggs · 100 g (143 kcal)'] },
  };
  const food = { ref: 'ledger:diary:2026-11-25:a1', meal: 'lunch', name: 'Chicken wrap', serving: '1 wrap', kcal: 450, protein_g: 30, carbs_g: 40, fat_g: 15, grams: 220, confidence: 'medium' as const };
  const out = withDiary(last, [food], (m) => (m === 'lunch' ? 'Meal 2' : 'Meal 1')) as typeof last;
  assertEquals(out.meals.length, 2);
  assertEquals(out.meals[1].ref, 'acc:meal:2026-11-25:lunch');
  assertEquals(out.meals[1].foods, [{ name: 'Chicken wrap', amount: '1 wrap', kcal: 450, done: true }]);
  assertEquals(out.nutrition.eatenKcal, 593);
  assertEquals(out.nutrition.proteinG, 43);
  assertEquals(out.nutrition.diary[1], 'Meal 2: Chicken wrap · 1 wrap (450 kcal)');
  assertEquals(out.nutrition.targetKcal, 2400);
  // The original is untouched.
  assertEquals(last.nutrition.diary.length, 1);
});
