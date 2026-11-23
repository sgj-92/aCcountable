import { assert, assertEquals } from 'jsr:@std/assert@1';

import { planInbound, sign, verify, type Inbound, type Session } from '../ledger-sync/logic.ts';

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
