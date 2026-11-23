# aCcountable ⇄ Ledger sync

Two-way sync between aCcountable (calories, training load, meal plans) and Ledger (Shaun's
day-planning app). One owner on each side, one day at a time.

## Who owns what

| Data | Direction | Source of truth |
|---|---|---|
| Planned training (type, start time, duration) | both ways | whichever app last changed it |
| Meals: name, suggested time, foods, kcal, done | aCcountable → Ledger | aCcountable |
| Meal ticked done in Ledger | Ledger → aCcountable | Ledger's tick logs the planned foods in aCcountable |
| Day's nutrition (eaten, targets, macros, food diary, day type) | aCcountable → Ledger | aCcountable |
| Weight for the day | both ways | whichever app last changed it |

Nothing is written unless something differs, so the echo of a change comes back as a no-op
and the two apps never ping-pong.

## Transport

Each side exposes one HTTPS endpoint that accepts `POST` with a JSON body and two headers:

- `x-sync-timestamp`: milliseconds since the epoch, as a string
- `x-sync-signature`: `sha256=<hex>`, the HMAC-SHA256 of `"<timestamp>.<raw body>"` with the shared secret

Reject anything whose signature doesn't match or whose timestamp is more than 5 minutes from
now (`401`). Return `2xx` once the day is applied.

- **aCcountable's endpoint:** `https://<supabase-project>.supabase.co/functions/v1/ledger-sync`
  (secrets `LEDGER_SYNC_SECRET`, `LEDGER_SYNC_URL` set on the Supabase project).
- **Ledger's endpoint:** a Firebase HTTPS function (e.g. `accountableSync`) holding the same secret.

## aCcountable → Ledger: one day

Sent whenever the day changes in aCcountable (debounced; unchanged days are skipped).

```json
{
  "v": 1,
  "origin": "accountable",
  "date": "2026-11-24",
  "training": [
    { "ref": "acc:session:7f3c…", "type": "padel", "title": "Padel", "startTime": "18:00", "durationMin": 90 },
    { "ref": "ledger:2026-11-24:resistance", "type": "resistance", "title": "Strength", "startTime": "07:00", "durationMin": 45 }
  ],
  "meals": [
    {
      "ref": "acc:meal:2026-11-24:lunch",
      "name": "Meal 2",
      "time": "16:00",
      "tag": "pre",
      "kcal": 620,
      "done": false,
      "foods": [
        { "name": "Chicken breast", "amount": "180 g", "kcal": 216, "done": false },
        { "name": "Basmati rice (dry)", "amount": "100 g", "kcal": 350, "done": false }
      ],
      "planned": [{ "planItemId": "…", "grams": 180 }]
    }
  ],
  "nutrition": {
    "eatenKcal": 1204, "proteinG": 96, "carbsG": 140, "fatG": 31,
    "targetKcal": 2400, "targetProteinG": 180, "targetCarbsG": 270, "targetFatG": 67,
    "dayType": "Padel day",
    "diaryOnly": false,
    "diary": ["Meal 1: Eggs · 2 eggs · 100 g (143 kcal)"]
  },
  "weightKg": 98.3
}
```

- `training.type` is one of Ledger's types: `padel`, `resistance`, `cardio`, `hiit`, `yoga`.
  (aCcountable maps tennis → padel; strength → resistance; run, cycle, swim, row, walk and
  sport → cardio.) `startTime` is `"HH:MM"` or `null`.
- `training.ref` is `acc:session:<id>` for sessions made in aCcountable; sessions that came from
  Ledger come back with Ledger's own ref.
- `meals.tag` is `"pre"` / `"post"` (before / after training) or `null`; `time` may be `null`.
- `meals.planned` is for aCcountable's bookkeeping; Ledger can ignore it.
- `nutrition` is `null` when there's nothing to report; `weightKg` is `null` when not logged that day.

## Ledger → aCcountable: one day

Sent when Ledger's plan for the day changes (training, meal ticks) or a weigh-in is logged.

```json
{
  "v": 1,
  "origin": "ledger",
  "date": "2026-11-24",
  "training": [
    { "ref": "acc:session:7f3c…", "type": "padel", "startTime": "19:00", "durationMin": 60 },
    { "ref": "ledger:2026-11-24:yoga", "type": "yoga", "startTime": null, "durationMin": 30 }
  ],
  "mealsDone": ["acc:meal:2026-11-24:lunch"],
  "weightKg": 98.0
}
```

- `training` is the **full** list of the day's planned training in Ledger. For sessions that came
  from aCcountable, keep and send back their `acc:session:…` ref; for Ledger's own, use
  `ledger:<date>:<type>`.
- aCcountable adds Ledger's new sessions, applies changes to time, length and type, and removes
  Ledger's sessions that disappear from the list (unless their burn was confirmed). It never
  deletes its own sessions because of a Ledger change.
- `mealsDone` lists the refs of aCcountable meals ticked done in Ledger; aCcountable logs that
  meal's planned foods at the amounts it last sent.
- `weightKg` is the day's weigh-in in Ledger, or `null`.

## Loop safety

Both sides compare before writing. Applying a day that matches what's already stored changes
nothing, so it triggers no outgoing sync.
