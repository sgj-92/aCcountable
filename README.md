# aCcountable

A calorie tracker for iOS and Android that **sets each day's target from the training you have planned** and logs meals from a **photo using Claude's vision model**.

- **Today:** calories left, protein/carbs/fat bars, the day's sessions, and meals. Snap a photo or add food by hand.
- **Week:** plan sessions for each day, see each day's target and what you ate, and check your week against plan. "Copy last week's training" repeats a regular schedule.
- **Photo scan:** Claude lists every item on the plate with portion, grams, kcal, macros and a confidence level. Everything is editable, and "How much did you eat?" (¼–2×) scales the whole plate before you save.
- **Profile:** body stats, daily activity outside training, goal (lose/maintain/gain, kg per week), protein g/kg, fat %, and training eat-back %.

Built with Expo (SDK 58, Expo Router) and Supabase (Postgres + Auth + Edge Functions). The Anthropic API key stays on the server inside a Supabase Edge Function. It never ships in the app.

## How targets are calculated

```
daily target = base + training
base         = BMR (Mifflin-St Jeor) × lifestyle factor ± goal adjustment
training     = Σ sessions: (MET − 1) × weight kg × hours × eat-back %
```

- **Lifestyle factor** covers activity *outside* training only (1.2 sedentary to 1.5 physical job), so sessions aren't counted twice.
- **Goal adjustment** = rate × 7700 kcal/kg ÷ 7 (e.g. 0.5 kg/week = 550 kcal/day). Base never drops below BMR. The app tells you when that cap kicks in.
- **MET − 1** subtracts the resting burn that BMR already counts. METs come from the Compendium of Physical Activities for 10 activity types × 3 intensities.
- **Watch override:** enter a session's "active calories" and it replaces the estimate.
- **Macros:** protein = g/kg × weight. Fat = fat % of the *base* target, so it stays the same every day. Carbs make up the rest, which means **extra training calories go almost entirely to carbs**.

All of this lives in [`src/lib/nutrition.ts`](src/lib/nutrition.ts) as pure functions with unit tests.

## Project layout

```
src/app/                 Expo Router screens
  (tabs)/index.tsx       Today
  (tabs)/week.tsx        Week planner
  (tabs)/profile.tsx     Profile + target settings
  scan.tsx               Photo → AI estimate → review → log
  food.tsx               Add/edit a food entry (with recent foods)
  training.tsx           Add/edit a training session
  sign-in.tsx
src/lib/
  nutrition.ts           Calorie/macro engine (pure, tested)
  targets.ts             Maps a stored profile + sessions onto the engine
  api.ts                 Supabase data access
  scan.ts                Image downscale + Edge Function call
supabase/
  migrations/            Schema + row level security
  functions/analyze-food Edge Function that calls Claude
```

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Copy `.env.example` to `.env` and fill in the **Project URL** and **publishable key** from *Project Settings → API Keys*.
3. Optional: under *Authentication → Sign In / Providers → Email*, turn off **Confirm email** so you can sign in straight away.

### 3. Deploy the database and AI function

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (or put `npx` in front of each command), then:

```bash
supabase login
```

```bash
supabase link --project-ref YOUR-PROJECT-REF
```

```bash
supabase db push
```

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

```bash
supabase functions deploy analyze-food
```

You can get an API key at [platform.claude.com](https://platform.claude.com). Each user is capped at 60 scans per rolling 24 hours. Change that with `supabase secrets set DAILY_SCAN_LIMIT=100`. Every scan is logged in the `ai_scans` table with its token counts, so you can watch the cost.

### 4. Run on your phone

The app uses native modules (camera, image picker), so use a development build:

```bash
npx expo run:android
```

```bash
npx expo run:ios
```

`run:ios` needs a Mac with Xcode. Without one, build in the cloud with EAS:

```bash
npx eas-cli@latest build --profile development --platform ios
```

### 5. Ship to TestFlight / Play

`app.json` uses the bundle ID `com.sgj92.accountable`. Change it if you want something else.

```bash
npx eas-cli@latest build --profile production --platform ios
```

```bash
npx eas-cli@latest submit --platform ios
```

```bash
npx eas-cli@latest build --profile production --platform android
```

## Development

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npx expo lint
```

## AI details

- Model: `claude-opus-5-5` with structured outputs (a JSON schema), so the response always parses. The function then validates it again with Zod.
- Server-side refusal fallback is on: if a safety classifier declines an image, the API retries on a fallback model in the same call.
- Effort is set to `medium`. In `supabase/functions/analyze-food/index.ts`, raise it to `high` for more careful estimates or lower it to `low` for faster, cheaper scans.
- Photos are downscaled to at most 1280 px JPEG on the phone before upload. They are **not stored** anywhere.
- The note field ("200 g chicken, cooked in 1 tbsp oil") counts for more than the photo. It's the easiest way to sharpen an estimate.

## Ideas for next steps

- Import workouts from Apple Health / Health Connect, so planned sessions get swapped for actual burn
- Weight log with adaptive TDEE (adjust targets from your real weight trend)
- Barcode scanning for packaged food
- Saved meals and recipes
- Sync training plans from a calendar
