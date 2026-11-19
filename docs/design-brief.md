# aCcountable: design brief

Use this with Claude Design to redesign the whole app. It covers what the app is for, every screen and state, the current design tokens, and what's practical to build, so the result can be implemented closely.

## 1. The app in one paragraph

aCcountable is a personal calorie and macro tracker for an athlete who's trying to lose weight while training hard (padel, running, gym). Each day's calorie target is built from base needs plus that day's training. Burn estimates come from the person's own WHOOP history, and the week rebalances when a day goes over or under. Food is logged three ways: by photo, where AI estimates it and you can reply to correct it; by weighing it, searching USDA or Open Food Facts and typing grams; or by barcode. A planner works out how many grams of each planned food hit the day's targets. Weigh-ins produce a trend line that shows whether the plan is actually working. An "On track?" panel warns when things drift.

**Who it's for:** one person, used many times a day, often one-handed in the kitchen or at the gym. **Speed and glanceability matter more than anything.**

## 2. Design goals

1. **Glanceable:** one look at Today answers "how much can I still eat, and am I on track this week?"
2. **Fast logging:** the most common actions (scan a meal, add a weighed food, log a session, weigh in) take 1–2 taps from Today.
3. **Plan + react:** the plan for the day and what actually happened sit side by side; adjustments are explained in plain words ("−160 to balance Monday").
4. **Calm but honest:** warnings are clear without being alarming; good news is visible too.
5. **Data-dense but not cluttered:** numbers are big, aligned and tabular; secondary detail is quieter.
6. **Dark-first,** with an equally polished light mode (user can choose Dark / Light / System).
7. **Original:** don't copy MacroFactor, MyFitnessPal or WHOOP's visual identity. It should feel like its own premium product.

## 3. Platform and what's practical to build

- **iPhone first** (Android later). Design at **393 × 852 pt** (iPhone 15/16 Pro). Respect safe areas and the home indicator.
- Built with **React Native (Expo SDK 58)**. Anything drawn must be doable with React Native views, **react-native-svg** (rings, charts, icons) and **Reanimated** (animation). Avoid web-only effects: CSS blur stacks, complex blend modes, heavy shadows on every element.
- **Navigation:** a native iOS **tab bar** (system component) with 4 tabs: **Today, Plan, Week, Profile**. Tab icons are SF Symbols. Everything else opens as an iOS **sheet / modal** with a native header.
- **Fonts:** the system font (SF Pro) is preferred. A custom font is possible if it's free to embed; say which.
- **Icons:** SF Symbols (iOS) / Material Symbols (Android) names are easiest.
- Keyboard-heavy screens (food entry, AI reply, plan text) must keep the focused field visible above the keyboard.

## 4. Current design tokens (to evolve or replace)

**Colours (dark / light):**

| Token | Dark | Light | Used for |
|---|---|---|---|
| background | #000000 | #F2F2F5 | screen |
| card | #111113 | #FFFFFF | cards |
| elevated | #1B1B1E | #F7F7F9 | raised surfaces |
| input | #1B1B1E | #EEEEF2 | text fields, chips, segmented controls |
| border | #24242A | #E4E4E9 | dividers |
| track | #232328 | #E6E6EB | empty part of rings and bars |
| text | #F5F5F7 | #0E0E10 | primary text |
| textMuted | #8E8E96 | #6B6B73 | secondary text |
| primary (accent) | #3DDC97 | #12A66A | actions, progress, "on target" |
| primaryText | #04150D | #FFFFFF | text on the accent |
| protein | #FF7A6B | #E5533F | protein ring and labels |
| carbs | #4CC9F0 | #1696C9 | carbs |
| fat | #FFC857 | #D99A0B | fat; also "warning" |
| training | #B98CFF | #7C4DDB | training burn, sessions |
| danger | #FF5A5F | #E0353B | over target, errors, alerts |
| success | #3DDC97 | #12A66A | confirmed, on track |

**Type** (system font): title 30/800, big number 40/800 tabular, heading 17/600, body 15/400, muted 14/400, small 12/400.
**Spacing:** 4, 8, 12, 16, 24, 32. **Radius:** 10 (inputs), 14 (buttons), 20 (cards), pill (chips).

**Current components:** Card, Button (primary / secondary / danger / ghost), Field (label + input + hint), Segmented control, Chip (selectable pill), ProgressBar, Ring (SVG circular progress; turns red past 100%), Stepper (‹ date ›), Divider, small coloured status dot.

## 5. Screens and what each must show

Realistic example data is in brackets. Please design **every state listed**.

### Tabs

**Today** (the home screen)
- Date stepper ‹ Today · Wed 18 Nov ›, with a way back to today when viewing another day.
- **Calorie summary:** big ring with kcal left [1,285 left], beside it Eaten [520], Target [1,805], Base [1,977], Training [+0 / +748], Week balance [−172]. States: under target, exactly on target, **over target** (ring and number red, "kcal over").
- **Macro progress:** protein, carbs, fat as small rings or bars [30 / 152 g, 40 / 176 g, 24 / 55 g].
- **On track?** list of 1–5 insights, most important first. Levels: **alert** (red), **warn** (amber), **info** (blue), **good** (green). Each has a title, an optional one-line detail, and an optional action link. Examples:
  - alert: "650 kcal over today's target. Did you train? Add the session." [action: Add a session]
  - warn: "On course to finish the week 481 kcal over."
  - warn: "Losing 0.21 kg/week, slower than your 0.50 kg goal."
  - info: "Confirm Mon's padel burn" [action: Confirm]
  - info: "Log your weight to check you're really losing" [action: Log weight]
  - good: "On pace: losing 0.48 kg/week"
- **Fasting card** (only if intermittent fasting is on): state "EATING WINDOW OPEN · 3h 46m left · closes 20:00", or "FASTING · 14h 05m fasted · opens 12:00", with a progress bar.
- **Primary actions:** Scan meal (camera, the most-used action) and Add food.
- **Training:** sessions today, each with its name [Padel · 90 min · moderate], burn [+748 or ≈ +748], and status: "✓ WHOOP confirmed" / "Estimate from your WHOOP history · tap to confirm" / "Estimate". Empty state: "Rest day."
- **Weight:** trend [84.9 kg · −0.21 kg/week] with a log button, or "Logged ✓" today.
- **Meals:** 1–6 sections with the person's own names [Breakfast/Lunch/Dinner/Snacks, or Meal 1…, or "Pre-workout"]. Each shows total kcal, + Add, and entries: name, serving and macros on one line, kcal on the right, and a 📷 marker for photo-logged food. Empty: "Nothing logged."

**Plan** (meal planner)
- Empty state: a large text box "What are you eating today?" with an example list and a **Plan my amounts** button; loading state "Working out your foods…".
- Planned state: summary "Planned for the day 2,274 of 2,288 kcal", macro diffs [P 143/144 (−1) · C 282/285 (−3) · F 63/64 (−1)], a status line (green "On target…" or red gap messages like "Carbs 40 g short: add a carb food"), and AI notes.
- Foods grouped by meal: name [Basmati rice (dry)], the amount as the hero [100 g, or 1 scoop · 30 g, or 5 hash browns · 175 g], and kcal and macros. Logged items look done (✓, dimmed); items with a fixed amount are marked.
- Actions: Add foods, Clear plan.

**Week**
- Week stepper ‹ 16 – 22 Nov ›.
- Summary: week budget [14,990], eaten so far [6,120], training adds [1,122], projection ("On course" / "On course to finish 171 kcal over" / under).
- 7 day rows: day + date, today highlighted, balancing adjustment [−117 / +200], eaten / target [3,300 / 2,356], a thin progress bar, session chips [✓ Padel 90′] and + Session. Untracked past days: "Nothing logged: not counted."
- Copy last week's training.
- Weight trend chart: dots for weigh-ins, a smooth line for the trend.

**Profile / settings:** rest-day target preview; About you (sex, birth date DD-MM-YYYY, height, weight); daily activity level (4 options with descriptions); goal (lose / maintain / gain + rate chips); fine-tuning (protein g/kg, fat %, training eat-back %); **Meals** (preset chips + rename / remove / add up to 6); **Intermittent fasting** (switch, presets 14:10 / 16:8 / 18:6 / 20:4 / OMAD, start time, length, summary line); **Training data** (WHOOP history, Weight & trend); Appearance (Dark / Light / System); App version (running build vs over-the-air update, Check for updates); Save; Sign out.

### Sheets / modals

**Add food:** meal picker; search box + Search; **Scan barcode** (inline camera with an aiming frame and Close); results in two sections, **Whole foods · USDA** and **Branded · Open Food Facts** (name, brand, P/C/F, kcal per 100 g, "some values missing" note); **Weigh** step: food name, source, big grams field, serving chips [1 bar · 50 g], [100 g], live kcal and macros, per-100 g line; Edit values directly; Recent foods list; Manual entry form.

**Scan a meal:** photo (or empty state with tips) + Retake / Library; optional note "Anything the photo can't show?"; analysing state; result with meal name, the AI's assumptions, your earlier replies ("You: no butter"), a **reply box + Update estimate**; editable items (confidence dot high/medium/low, name, portion, kcal/P/C/F, Remove); "How much did you eat?" (¼ ½ ¾ All 1½ 2×); meal picker; Log separate items / Log as one meal; totals; Add to log.

**Training session:** date stepper; **Your WHOOP activities** (chips, most used first) with a line like "Usually 52 min · about 610 kcal · 30 sessions", then Other activities; duration; intensity (Easy / Moderate / Hard); notes; **How did it go?** (WHOOP calories, actual minutes; only for today or past days); result card "+748 kcal adds to Wed's target" with source ("Estimated from your 3 WHOOP 'Padel' sessions" / "Confirmed from WHOOP" / generic); optional override; Delete.

**Planned food:** name, per-100 g line + source; **Log what you ate** (planned amount, grams field, live macros, Log 250 g); logged state with Un-log; Fix this amount (switch + grams); portion range min/max; nutrition per 100 g + "Use exact values from the food database"; meal; Save; Remove from plan.

**Weight:** date stepper; weight field + tip; Save; trend number, rate and pace text (on pace / slower / faster / wrong direction); chart; recent list.

**WHOOP history:** how-to steps; Choose export file; working state; preview (file, count, date range, columns read); "What it learned" list per activity [Padel · 38 sessions · usually 90 min | 574 kcal/h · ≈ 860 per session]; Import; success state.

**Sign in:** name and strap line "Calories that follow your training.", Sign in / Create account, email, password, errors, the "check your email" state.

## 6. What I'd like back

1. A **design system**: colour tokens for dark and light (with contrast checked), type scale, spacing, radii, elevation, and component specs (sizes, padding, states: default / pressed / disabled / selected / error).
2. **Every screen and sheet above**, in **dark and light**, including empty, loading, over-target and warning states.
3. **Today** redesigned first, as the hero; show 2–3 layout directions before settling.
4. Specs I can hand to a developer: measurements, which component each element uses, and any animation (e.g. ring fill, number count-up, insight appear).
5. Optional: an app icon concept and a tab bar icon set (SF Symbol names are ideal).

Keep it implementable in React Native, as described in section 3.
