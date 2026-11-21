# aCcountable redesign: developer handoff

The approved design for the whole app. It covers what to build, in what order, and the numbers to build it with.

- **Canvas (source of truth for visuals):** https://claude.ai/artifact/FvJ8v8xs7cpizAgV7jgeVw. It is private to the owner's account. A Claude session on the same account can read it with the Artifact tool (`action: "read"`, `path: "project/<Board>.dc.html"`). Pages: **Tabs**, **Sheets**, **Today · directions** (the chosen one is *Hybrid*), **Design system**.
- **Board sources in this repo:** `docs/design/boards/*.dc.html`. These are HTML mockups, not React Native. Read them for exact layout, copy and numbers. The `renderVals()` script at the bottom of each file holds the example data and the colour logic per state.
- **Tokens:** `docs/design/theme.next.ts`. Proposed replacement for `src/constants/theme.ts`, with a map from old keys to new ones.
- **Brief this answers:** `docs/design-brief.md`.

## Build order

1. **Tokens and fonts.** Move `theme.next.ts` into `src/constants/theme.ts` and update call sites using `LegacyKeyMap`. Add Archivo 700/800 (`npx expo install @expo-google-fonts/archivo expo-font`) through the expo-font config plugin. Leave Appearance (Dark / Light / System) working as it does now.
2. **Primitives in `src/components/ui.tsx`.** Restyle Card, Button (primary / secondary / ghost / danger at L 56, M 44 and S 32 + hitSlop; pressed, disabled and loading states), Field (default, focused with a 2 pt accentLine ring, error with a 2 pt alert ring plus ErrorText, disabled at 40 %), Segmented, Chip (selected = accent fill), ProgressBar (over = alert), Stepper.
3. **New components** (list below), starting with the ones Today needs.
4. **Today** (Hybrid layout, `TodayH.dc.html` / `TodayStates.dc.html`).
5. **Sheets**, the most-used first: Scan a meal, Add food, Training session, Weight, Planned food, WHOOP history.
6. **Plan, Week, Profile, Sign in.**

Run `npx expo lint` and `npx tsc --noEmit` after each step (AGENTS.md).

## Look in one paragraph

Dark-first graphite background with one lime accent. The capital C in "aCcountable" is the only coloured letter, and its open shape becomes the calorie ring (a 270° arc with the gap facing right) and the Today tab glyph. Words are SF Pro, so Dynamic Type and native sheets match. Every number is Archivo with tabular figures. Cards are flat in dark, where surfaces step up in lightness, and get a single light shadow in light mode. Status uses colour, an icon shape and a word together, never colour alone.

## Platform decisions

- **Tabs:** keep `NativeTabs` (expo-router). Today icon `c.circle` / `c.circle.fill` (was `flame.fill`), Plan `list.bullet.clipboard`, Week `calendar`, Profile `person.crop.circle`. Draw nothing custom for the tab bar; on iOS 26 it's the floating system bar.
- **Sheets:** keep `presentation: 'modal'` with the native header. Close (xmark) goes on the left, the title is centred, and the primary action sits in the content or pinned above the keyboard.
- **Keyboard:** keep `ScrollView automaticallyAdjustKeyboardInsets` + `keyboardDismissMode="interactive"` (already in `Screen`). The focused field and its action must stay above the keyboard. The boards draw the keyboard as a grey placeholder block.
- **Quick log dock (Today only):** absolutely positioned, left/right 16, bottom = `insets.bottom + 62 + 12` (top 692 on an 852 screen), height 66, padding 7, radius 33, `floatBg` + 1 pt `floatBorder` + e2 shadow. Buttons: Scan meal (flex 1.4, h 52, accent) → `/scan`; Add food (flex 1) → `/food`; "+" (52 circle) opens a native menu with Log session and Weigh in. Today's ScrollView bottom padding is 200.
- **Motion:** Reanimated, and every animation honours `useReducedMotion()`:
  - ring and gauge fill 700 ms out-cubic, starting from the previous value
  - number count-up 600 ms
  - crossing the target: `interpolateColor` to alert over 240 ms, plus one warning haptic
  - insights: `FadeInDown` 220 ms with a 40 ms stagger
  - week bars grow 500 ms with a 30 ms stagger
  - press: scale 0.97 over 90 ms, then spring back
  - skeleton pulse: opacity 0.55 ↔ 1, 900 ms
- **Elevation:** dark mode uses surface steps, no shadows. Light mode e1 = y1 blur3 α.07; e2 (dock, floating) = y8 blur24 α.14. One shadow per element.
- **Accessibility:** every target is ≥ 44 pt. Ring `accessibilityLabel` reads e.g. "1,781 kcal left of 2,301". Over / under / left is always spelled out in words.

## New components

| Component | Where | Key spec |
|---|---|---|
| CRing | Today hero, Components board | 208 pt, stroke 16, r 96, 270° arc rotated 45°. Track, then a training segment (training ÷ target, at the arc's end, `trainingSeg`), then the fill (`accentLine`, `alert` when over). Centre: numHero, unit 15/600, sub 13. |
| TargetLedger | Today | 4-column grid: base · training (training colour; "0 rest day" in text3) · week balance (signed −/+) · target (left hairline). numS + caption 12. |
| MacroBars | Today | 3 columns, gap 14. Label + "117 left" (alert "+25 over"), bar 6 r3, value 14/18. |
| WeekStrip | Today hero (bottom), Week | Link → /week. 7 columns gap 4; bar 10×36 r5; 2 pt target tick. Fill colours: past `pastFill`, over `alert`, today `accentLine`, future dashed outline. Viewed day on `raised` r10. Summary line 13 with a warn dot. |
| InsightsCard / InsightRow | Today | Icon 32 tinted; shape per level (octagon alert, triangle warn, circle-i info, check good). Title 15/600, detail 13, action 14/600 ›. Max 5, sorted alert > warn > info > good. The week projection lives in WeekStrip, not here. |
| FastingBar | Today | Open: "Eating window · 3h 46m left · until 20:00" in accentText. Fasting: "14h 05m fasted · opens 12:00" in info. Bar 6. |
| Tile (2-up) | Today, Week | r22, pad 14, overline caption, numL value, StatusPill or dashed "+ Session". |
| MealCard + FoodRow | Today | Card r20. Header min 52: name 17/600, total numXS, AddButton 44 (32 visual). FoodRow pad 10, 14 pt camera glyph when photo-logged, swipe-to-delete. |
| QuickDock | Today | See Platform decisions. |
| StatusPill | Training, Today | 28 pill, 12/600: "✓ WHOOP confirmed" (good), "Estimate · tap to confirm" (info), "Estimate" (raised). |
| GramsField + ServingChips | Add food, Planned food | Height 72, numL value, live kcal on the right; chips 36. |
| ConfidenceDot | Scan a meal | Filled = high, half = medium, hollow warn = low. |
| Skeleton | Loading states | `raised` blocks with the pulse above. Show only when there's no cached data. |

## Example data used on the boards

The user's own profile: male, 175 cm, 98.3 kg, born 20-10-1992, lightly active, losing 1 kg/week, protein 1.5 g/kg, fat 25 %, eat-back 75 %. Rest-day base is 1,912 (P 147 · C 211 · F 53). Meals: Meal 1–4 + Snacks.

Thursday 19 Nov is a padel day:
- target = 1,912 + 561 (748 burn × 75 %) − 172 week balance = **2,301**, with P 147 · C 308 · F 53
- eaten 520, so 1,781 left
- the week projection reads "481 over pace"

The week of 16–22 Nov adds up to a budget of 14,990.

---

# Screens

Each board shows the states side by side, then a **Spec** panel. The rows below are that panel's text, copied from the boards.

## Today (tab)

Boards: `TodayH.dc.html` and `TodayStates.dc.html` (+ `-Light` wrapper).

**States:**
- Under target (default)
- On target
- Over target: ring, number and unit in alert, "kcal over", alert insight first
- New day: rest day, fasting, nothing logged, nudge to weigh in
- Another day (Tue 17): closed under target in good, ↩ Today chip, fasting hidden
- Loading: skeleton on first open only

**Spec:**

| Element | Spec |
|---|---|
| Screen | ScrollView · padding 62 / 16 / 200 (clears dock + tab bar) · automaticallyAdjustContentInsets · refresh spinner only while pulling. |
| DayHeader | footnote 13/600 text2 + largeTitle 34/41 · IconButton 44 circle raised ‹ › · “↩ Today” chip 32 pill goodBg when not today · swipe hero ← → to change day (cross-fade 180 ms). |
| HeroCard | Card r24 · pad 16/16/14 · gap 12 · centred. One card answers today and the week. |
| CRing | 208 pt · stroke 16 · r 96 · 270° arc, rotate 45° (gap faces right like the C) · track · trainingSeg = training ÷ target at the arc end · fill accentLine → alert when over · centre num.hero 52/56, unit 15/600, sub 13. |
| TargetLedger | 4-col grid · num.s 17/22 + caption 12 · base · training (training colour, “0 rest day” in text3) · week balance (signed −/+) · target with left hairline. |
| MacroBars | 3-col gap 14 · label 12/600 + “117 left” 12/600 (alert “+25 over”) · ProgressBar 6 r3 · value num 14/18. |
| WeekStrip | Link → /week · 7 cols gap 4 · bar 10×36 r5 · target tick 2 pt · past pastFill, over alert, today accentLine, future dashed 1.5 · viewed day raised r10 · summary 13 + warn dot. |
| InsightsCard | r24 · rows pad 10 · icon 32 tinted, shape per level · title 15/600 · detail 13 · action 14/600 › · max 5, alert > warn > info > good. Week projection lives in WeekStrip. |
| FastingBar | r20 pad 12/16 · open: accentText “Eating window · 3h 46m left · until 20:00” · fasting: info “14h 05m fasted · opens 12:00” · bar 6 · ticks every minute. |
| Tiles 2-up | gap 12 · r22 pad 14 · Training: session + StatusPill, or “Rest day” + dashed “+ Session” · Weight: trend / not logged today (info) / logged (good) + sparkline 140×26. |
| MealCard | r20 · header min 52: name 17/600, total num 15, AddButton 44 (32 visual) · FoodRow pad 10, photo glyph 14 · swipe left = Delete. |
| QuickDock | absolute · left/right 16 · bottom = insets.bottom + 62 + 12 (top 692 on 852) · h 66 pad 7 r33 e2 · Scan meal flex 1.4 h52 accent → /scan · Add food flex 1 → /food · “+” 52 → native menu: Log session, Weigh in. |
| Tab bar | NativeTabs (system) · Today = c.circle / c.circle.fill · Plan, Week, Profile as on the Brand board. |
| Loading | Only when no cached day exists · skeleton blocks in raised · opacity 0.55 ↔ 1, 900 ms, withRepeat · ring track drawn at once · no spinner. |
| Motion | Ring 700 ms out-cubic from the previous value · count-up 600 ms · crossing target: interpolateColor 240 ms + one warning haptic · insights FadeInDown 220 + 40 stagger · week bars grow 500 ms, 30 stagger · press scale 0.97. |
| Another day | › enabled · past under target shows “kcal under” in good · fasting hidden · dock and + Add log to the viewed day (sheet title carries that date). |
| Accessibility | Ring label “1,781 kcal left of 2,301” · numbers maxFontSizeMultiplier 1.3 · all targets ≥ 44 · colour never alone: icon shapes + the words “over / under / left”. |

## Plan (tab)

Boards: `PlanTab.dc.html` (+ `-Light` wrapper).

**States:**
- Empty: big text box, example placeholder, Plan my amounts disabled until there is text
- Loading: "Working out your foods…", skeleton rows
- Planned · on target: summary, macro diffs, green status, foods by meal with the amount as the hero, logged rows dimmed, fixed amounts marked
- Planned · gap: alert status "Carbs 40 g short: add a carb food"

**Spec:**

| Element | Spec |
|---|---|
| Screen + large title | Screen (ScrollView) · native large title 34/41 · gutter 16 · card gap 12 · bottom inset 120 so the last row clears the tab bar. |
| PlanInput | Field multiline · min 232 pt, grows to 320 · r16 · pad 12/14 · body 17/24 · placeholder text3 · focus ring 2 pt accentLine. |
| Keyboard | ScrollView automaticallyAdjustKeyboardInsets + keyboardDismissMode interactive keeps the box and button above the keyboard. |
| Plan my amounts | Button L primary · 56 · r18 · disabled (40 %) while empty · loading = spinner + “Planning…”, width locked, list read-only. |
| PlanProgress | Card · title headline 17/600 · one-line footnote · 3 skeleton rows (18 + 12 bars, raised) · opacity pulse 0.5↔1, 900 ms withRepeat. |
| PlanSummary | Card pad 16 · overline · num 40/44 Archivo 800 · count-up 600 ms when the plan arrives. |
| MacroDiff | Grid 3 · dot 8 + caption · value num.xs / target · diff caption; alert colour when \|diff\| > 5 g. |
| StatusLine | InsightRow compact on its tint · r14 · pad 10/12 · good = check, alert = octagon + S button (32) with the one fix. |
| AI note | footnote 13/18 text2 · max 3 lines, tap to expand. |
| MealGroup | Card r20 · header 44: overline name + total num 14 text2 · rows separated by hairlines. |
| PlanFoodRow | min 64 · pad 10/8 · amount num.m 22/26 (hero) · name body 15 · meta footnote · chevron → Planned food sheet. |
| Logged / fixed | Logged: 28 pt accent check, row 50 % · Fixed: 22 pt pill “FIXED” with lock glyph, raised. |
| Header action | Edit list · M secondary 44 pill → returns to PlanInput with the list, Plan again replaces rows. |
| Add / Clear | Add foods = M secondary · Clear plan = ghost in alert → native ActionSheet confirm (destructive). |
| Motion | Rows enter FadeInDown 220 ms, stagger 30 · re-plan uses LinearTransition · log/un-log fades opacity 180 ms. |
| Tab bar | NativeTabs · Plan = list.bullet.clipboard / .fill selected · tint tabActive. |

## Week (tab)

Boards: `WeekTab.dc.html` (+ `-Light` wrapper).

**States:**
- This week: stepper, summary with projection, day rows
- Scrolled: future days, Copy last week’s training, weight trend chart
- Past week: Back to this week, finished under, an untracked day "Nothing logged: not counted"

**Spec:**

| Element | Spec |
|---|---|
| Screen + large title | Screen (ScrollView) · native large title collapses to the 17/600 inline title with a hairline once scrolled · gutter 16 · card gap 12. |
| WeekStepper | Stepper · 44 pill raised · arrows 44×44 · label 15/600 tabular · swipe the summary card to change week too. |
| Back to this week | S chip 32 · goodBg + accentText · only when not on the current week · cross-fade 180 ms on change. |
| WeekSummary | Card r24 pad 16 · 3 stats num.m 22/26 + caption · training adds in training colour. |
| Mini strip | WeekStrip (same as Today) · bar 10×36 · fill = eaten, 2 pt tick = target · over = alert · future = dashed track. |
| Projection | StatusLine on its tint r14 · warn “On course to finish 481 kcal over” · good “On course” · info when under by > 300. |
| DayRow | Pressable min 76 · pad 12/10 · r18 · day 15/700 + date 12 · eaten / target num.xs 15 · diff num 13 right. |
| Today row | raised background, day label in accentText, diff reads “1,781 left”. |
| Adjustment chip | 22 pill · raised (surface on today) · 12/600 tabular · signed with − / + · tap opens the “why” sheet. |
| Day bar | ProgressBar 4 · r2 · accentLine ≤ target, alert when over (full width, no overflow) · future/untracked = 1 pt dashed track. |
| SessionChip | 26 pill 12/600 · done ✓ trainingBg · estimate “≈ … · confirm” · planned dashed training · “+ Session” dashed text3 → Training sheet. |
| Untracked day | “Nothing logged” text3 + “not counted” · budget and summary exclude it. |
| Copy last week | Button M secondary full width · confirm alert lists the sessions it will add, then chips appear with FadeIn. |
| WeightTrendChart | Card pad 16 · svg 329×166 · plot pad L30 R8 T8 B26 · grid 1 pt line · dots r3.5 text3 · latest r4.5 accentLine. |
| Trend line | 2.5 pt accentLine, Catmull-Rom → cubic path · goal 1.5 pt dashed 4/4 text3 · draws in with strokeDashoffset 700 ms out(cubic). |
| Tab bar | NativeTabs · Week = calendar (tint only when selected). |

## Profile (tab)

Boards: `ProfileTab.dc.html` (+ `-Light` wrapper).

**States:**
- Top: rest-day target preview, About you, Daily activity
- Middle: Goal + rate, Fine-tuning, Meals
- Bottom: Intermittent fasting, Training data, Appearance, App version, Sign out. Save sits in the nav bar (dirty dot, disabled until something changes)

**Spec:**

| Element | Spec |
|---|---|
| Screen | Existing Screen (ScrollView): 16 pt gutter, 12 pt between cards, bottom inset clears the tab bar (+96). automaticallyAdjustKeyboardInsets + keyboardDismissMode interactive keep the focused field above the keyboard. |
| Title + Save | Native headerLargeTitle 34/41 collapsing to inline 17/600 at ~52 pt scroll. Save is the header right button: text3 + disabled until dirty, then accentText with a 7 pt dot. On save: Haptics success, dot fades 160 ms. |
| TargetPreview (new) | Card r24, pad 18/20. num.hero variant 48/52 Archivo 800 + 17/600 unit. Recomputes live from unsaved values (debounce 300 ms) and counts up 600 ms out-cubic. |
| Field | 44 h, r12, pad 0/14, 17 pt text; label 13/16 text2, gap 4. Numbers in Archivo 600 tabular. Focus = 2 pt accentLine border. Height/weight/protein: decimal-pad. Percent: number-pad. |
| Birth date | Field that opens the native date picker (compact, wheels on tap). Stored ISO, shown DD-MM-YYYY. |
| Segmented | Sex, Goal, Appearance. 40–44 h track raised r12, pad 3, thumb r9 (dark #3A3D36 / light white + shadow y1 r3 α.15). Thumb slides 220 ms out-cubic. accessibilityRole radiogroup. |
| ActivityOption (new) | Pressable, min 52 h, r14, pad 7/14; title 15/600, description 13/17. Selected = accent fill + onAccent text. Single choice, role radio, 6 pt gap. |
| Rate / fasting chips | Chip 36 h pill, pad 0/12–14, Archivo 600 15 tabular. Selected = accent fill, onAccent 700. hitSlop 4 to reach 44. |
| Fine-tuning | 3-up grid, gap 8. Helper footnote 13/18 text2. Out-of-range values show ErrorText under the grid, not per field. |
| Meals | Preset chips replace all names after an Alert confirm. MealNameRow = Field + Remove text button (alert 15/600, 44 h). Remove disabled at 1 meal; “+ Add meal” hides at 6. New row FadeIn 180 ms, removed FadeOut + LinearTransition. |
| Fasting | Native Switch (trackColor.true = switchOn). Off collapses the rest of the card with LinearTransition 220 ms. Window opens = native time picker. Summary line recomputes live. |
| Training data rows | Row 56 h, 32 pt icon tile r10, title 15/600 + meta 13/18, chevron text3. Opens whoop-import and weigh-in sheets. |
| App card | Appearance applies instantly via AppThemeProvider (cross-fade 200 ms). Version rows 13/18; OTA pill = StatusPill good. Button M secondary cycles Check for updates → Loading → Restart to update (expo-updates). |
| Sign out | Button ghost, alert text 17/600, 44 h, 24 pt above the tab-bar inset. Native Alert confirm. |
| Tab bar | NativeTabs, Profile = person.crop.circle(.fill). Renders the system floating bar; we only tint (accentText / tabIdle). |

## Add food (sheet)

Boards: `AddFood.dc.html` (+ `-Light` wrapper).

**States:**
- Default: meal picker, search, Scan barcode, Enter manually, Recent
- Results: Whole foods · USDA and Branded · Open Food Facts, "some values missing" flagged
- Barcode: inline camera with aiming frame + Close
- Weigh: big grams field above the keyboard, serving chips, live kcal/macros
- Manual entry with a field error

**Spec:**

| Element | Spec |
|---|---|
| Sheet | Stack.Screen presentation "modal" (pageSheet), native header: close 44 left, title 17/600. Body = Screen (ScrollView, gutter 16, gap 12). |
| MealPicker · meal-picker.tsx | Horizontal ScrollView of Chip 36 h, pad 0 14, gap 8, bleeds off the right edge. Selected = accent fill + onAccent 600. Default meal from time of day. |
| SearchField + Search | Field 52 h, r14, raised, returnKeyType "search". Button M 52 h primary, disabled (40 %) until 2 characters. Clear button 44 × 44 inside the field. |
| Scan barcode | Button secondary 52 h, full width, SF barcode.viewfinder 22. Opens the inline scanner in place. |
| BarcodeScanner · barcode-scanner.tsx | expo-camera CameraView, barcodeScannerSettings ean13/ean8/upc_a/upc_e. Box 300 h r22. Aiming frame 260 × 160, corner brackets 4 pt accent, r 6. Scan line 2 pt accent at 85 %, sweeps 1.6 s ease-in-out loop. Haptics.notificationAsync(Success) on read → Weigh. |
| Enter manually | Ghost button 44 h, accentText 16/600, pushes the manual form. |
| Recent | Card r22, pad 14/16. FoodRow 15/20 + 13/18 meta, kcal num.xs right. “+” 32 circle (44 hit) re-logs at the last amount to the selected meal, row flashes, toast “Logged 125 · Undo”. |
| ResultSection | Overline 12/700 + source badge (20 h, r10). Card r20 of ResultRow; USDA first, Open Food Facts second, 10 rows each, “Show more”. |
| ResultRow | min 60 h: name 15, brand 13 text2, P · C · F per 100 g, kcal num.s right, chevron. Missing values: warn triangle + “Some values missing” 12/600. |
| Loading results | Skeleton rows (raised blocks), opacity pulse 0.5 ↔ 1, 900 ms. Each section streams in independently. |
| Weigh header | Back chevron replaces close. Name 20/700, source badge + per-100 g line 13 text2. |
| GramsField | 80 h, r18, raised, 2 pt accentLine ring when focused. Value num 40/800, unit 20 text2. keyboardType "decimal-pad", autoFocus, selectTextOnFocus. |
| ServingChips | Chip 36 from the food’s serving sizes + 100 g. Tap fills grams, haptic selection. |
| LiveMacros | Card r18 pad 12/16: kcal num 24 + P/C/F dots. Recomputes per keystroke; numbers count up 200 ms. |
| Primary | Button L 56 h “Add 180 g to Meal 3”. Lives in the scroll content, which uses automaticallyAdjustKeyboardInsets so it stays visible above the keyboard. |
| Manual form | Field ×6: name, amount + unit Segmented (g / ml), kcal/P/C/F in a 2-col grid. Validate on submit: kcal required → ErrorText 13 alert + 2 pt alert ring, focus moves to it. Offers kcal from macros (4/4/9). |
| After logging | Sheet dismisses; Today ring and meal total count up (600 ms), entry row flashes. |

## Scan a meal (sheet)

Boards: `ScanMeal.dc.html` (+ `-Light` wrapper).

**States:**
- Empty with tips: Take photo / Library
- Photo + optional note
- Analysing: sweep + steps
- Result top: meal name, assumptions, earlier replies, reply box + Update estimate above the keyboard
- Result bottom: editable items with confidence dots, How much did you eat?, meal picker, Log separate / as one, totals, Add to log

**Spec:**

| Element | Spec |
|---|---|
| Presentation | Stack modal (pageSheet), native header: close xmark left, title 17/600. Content in Screen (ScrollView) with 16 gutter, 8 top. |
| Tips card · Card | radius 24, pad 32/24/28, icon tile 72 r24 goodBg. Title 20/700, body 15/21 text2. |
| PhotoPicker · Button L ×2 | 56 h, r18, gap 8. Take photo = expo-image-picker launchCameraAsync; Library = launchImageLibraryAsync. Compress to 1280 px long edge. |
| Photo preview | 361 × 270, r20, cover. Retake / Library are Button M (44, r14) below it. |
| NoteField · Field | label 13 text2 + “Optional”. 52 h, r14, 17/400. Focus ring 2 pt accentLine. |
| Pinned action | Estimate / Add to log sit in a footer above the home indicator (bottom inset 34). Footer has a hairline and bg so content scrolls under it. |
| AnalysingState | Photo at 45 % opacity. Sweep: 2 pt accentLine + 44 pt goodBg band, translateY 0→270 loop, 1.2 s linear (withRepeat). Detected-food boxes fade in 160 ms. |
| Steps list | done = 24 circle goodBg + check; current = spinner (rotate 800 ms loop); pending = hollow 10 dot text3. Each step FadeIn 220 ms. aria-live polite. |
| ResultHeader · Card | thumb 56 r14, name 17/600, macros 13 text2, kcal num 26/800 with count-up 600 ms when the estimate changes. |
| AssumptionList | overline 12/700 + rows 14/19 with 6 pt info dot. The AI’s guesses in plain words, one per line. |
| ReplyThread | You = right bubble raised, r18/18/6/18. AI = left bubble goodBg, says what changed (“−72 kcal”). Max width 280. |
| ReplyBox | pill input 48 h r24 + Button “Update estimate” 48 h r24. Keyboard: ScrollView automaticallyAdjustKeyboardInsets + keyboardDismissMode interactive; scrollToEnd on focus so the box sits 10 pt above the keyboard. |
| ScanItemRow · FoodRow | min 60. ConfidenceDot 12: high filled good, medium half warn, low hollow warn (shape differs, not only colour). Tap opens edit; remove = 44 target, minus-circle alert, undo toast 4 s. |
| PortionChips | 6 equal chips, 36 h pill, Archivo 14/700. Scales every item and the total live; count-up 300 ms. |
| MealPicker · Chip | existing meal-picker.tsx, horizontal scroll, defaults to the meal for the time of day. |
| LogMode · Segmented | 40 h, r12, thumb r9. Separate items (default) or As one meal. |
| Add to log | Button M 44 in footer; label carries kcal + meal. On success: Haptics.notificationAsync(Success), dismiss, Today ring counts up. |
| Light mode | Photo placeholder #CFCBBE, keyboard follows system; all text tokens as Tokens board. |

## Training session (sheet)

Boards: `TrainingSheet.dc.html` (+ `-Light` wrapper).

**States:**
- Plan: WHOOP activity chips + usually line, duration, intensity, estimate result card
- How did it go: WHOOP calories + minutes, "Confirmed from WHOOP"
- Past day: your own burn figure (override) + Delete

**Spec:**

| Element | Spec |
|---|---|
| Presentation | Stack modal “training”, native header (close left, title). Screen ScrollView, 16 gutter, 12 gap between groups. Footer pinned above home indicator (34). |
| Date · Stepper | 44 h pill, raised, arrows 44×44. Future days allowed (planning). Changing day re-runs the estimate. |
| ActivityChips · Chip | 36 h pill, gap 8, wrap. “Your WHOOP activities” sorted by session count, selected = accent. “Other activities” below, generic estimates. |
| UsuallyLine · T muted | 13/18 text2, tabular. Typical minutes · typical kcal · session count from WHOOP history. Hidden for “Other”. |
| DurationField · Field | 120 wide, 52 h, r14. Archivo 20/800 value + unit. number-pad. Prefilled with the usual minutes. |
| IntensitySegmented · Segmented | 52 h to match the field, thumb r10. Easy / Moderate / Hard scale the per-minute burn ±15 %. |
| Notes · Field | 48 h, optional, single line. |
| BurnResultCard | trainingBg, r20, pad 14/16. Archivo 28/800 training colour (≈ when estimated), 15/600 “kcal adds to <day>’s target”, eat-back line, source line 12. Number count-up 400 ms on every change. |
| Source states | Estimate: “≈” + “Estimated from your N WHOOP ‘X’ sessions”. Confirmed: no ≈ + StatusPill good “Confirmed from WHOOP”. Generic: “Typical estimate for this activity”. Own: “your own number”. |
| ConfirmCard “How did it go?” | Card r22 pad 16. Only for today or past days. Two fields side by side (kcal, minutes). Shows the delta vs the estimate in plain words. |
| Override | Row 52 with native Switch (trackColor.true accent / accentLine). Reveals kcal field with 2 pt focus ring + warn note “Overrides the WHOOP estimate of N”. |
| Save · Button L | 56 h r18 accent. Label carries the number when confirmed (“Save · +812 kcal”). Success: haptic success, dismiss, Today ring + target count up. |
| Delete · Button ghost alert | 44 h. Alert.alert confirm with destructive style; the week rebalance runs after. |
| Keyboard | Screen ScrollView automaticallyAdjustKeyboardInsets; footer moves up with the keyboard (KeyboardStickyView or bottom inset from useKeyboardHeight). |
| Accessibility | Result card is one accessibility element: “Adds about 748 kcal to Thursday’s target, 561 counted.” Chips announce selected. |

## Planned food (sheet)

Boards: `PlannedFood.dc.html` (+ `-Light` wrapper).

**States:**
- Not logged: Log what you ate (planned amount, grams, live macros, Log 100 g)
- Logged: banner with Un-log
- Fixed amount + portion range (ignored while fixed), nutrition per 100 g, meal, Save, Remove from plan

**Spec:**

| Element | Spec |
|---|---|
| Sheet | Modal pageSheet “Planned food” (plan-item.tsx). Native header: close 44 left, title 17/600 (food name when scrolled). Screen gutter 16, gap 12. |
| Food header | Name 22/700, source badge 18 h r9 + per-100 g line 13 text2, num tabular. |
| Log card | Card r22 pad 16, gap 10. Title 17/600 + “Planned 100 g” 13 text2 right. |
| GramsField (M) | 64 h r16, raised; value num 32/800, unit 18 text2. Prefilled with the planned amount, selectTextOnFocus, decimal-pad. |
| LiveMacros | kcal num 20/800 + P/C/F dots 7 pt. Recompute per keystroke, count-up 200 ms. |
| Log button | Button primary 52 h r16 “Log {grams} g”, label follows the field. Tap: haptic success, row on Plan gets ✓ and dims (opacity 0.5, 240 ms). |
| Logged banner | goodBg card r22 pad 14/16: 32 accent check circle, “Logged 100 g to Meal 3” 15/600, time · kcal 13. Un-log = Button S secondary 36 h on surface. |
| Locked state | Log + settings cards at 45 % opacity, pointerEvents none, aria-disabled. Helper line 13 text2 explains how to change it. |
| Fix this amount | Row 52–56 h: label 15/600 + hint 13. Native Switch, trackColor.true = switchOn (accent dark / accentLine light). On → reveals fixed GramsField 56 h with the serving description right. |
| Portion range | Two Field 48 h r14 (Min g / Max g) in a 2-col grid. Disabled (45 %) while fixed, hint says why. Validate min ≤ max, ErrorText below. |
| Nutrition per 100 g | 4-col grid of Field 48 h r12 with macro dot labels 12. “Use exact values from the food database” ghost link 13/600 resets them. |
| MealPicker | Chip row 36 h, horizontal scroll; selected = accent. |
| Save | Button L 56 h primary. Dismisses and re-runs the planner if fixed/range changed; Plan totals count up. |
| Remove from plan | Ghost 44 h alert text. Native Alert confirm (destructive) → row exits FadeOut 160 + LinearTransition. |
| Keyboard | Screen ScrollView automaticallyAdjustKeyboardInsets + keyboardDismissMode interactive; focused field scrolls above the keyboard, Log button directly under it. |

## Weight (sheet)

Boards: `WeightSheet.dc.html` (+ `-Light` wrapper).

**States:**
- Entry: date stepper, big decimal field + tip, Save above the keyboard
- Saved: trend, rate, pace text, chart, recent list
- Not enough data yet, plus the "wrong direction" alert example

**Spec:**

| Element | Spec |
|---|---|
| Presentation | Stack modal “weigh-in”, native header (close left, title, Done right after saving). Screen ScrollView, 16 gutter. |
| Date · Stepper | 44 h pill. Next is disabled on today (opacity 0.4, text3) — no future weigh-ins. Past days edit that day’s reading. |
| WeightField · Field (big) | 72 h, r18, 2 pt accentLine focus ring. Archivo 40/800 tabular, “kg” 17 text2. keyboardType decimal-pad, autoFocus on open. Accepts “,” as decimal. |
| Validation · ErrorText | 30–250 kg, else ring turns alert + “That looks off. Enter 30–250 kg.” Save disabled until valid. |
| Tip + last reading | 13/18 text2 and text3. Last reading helps catch typos (98.3 vs 9.83). |
| Save · Button L | 56 h r18, sits directly under the card so it stays above the keyboard (automaticallyAdjustKeyboardInsets). Success: Haptics.notificationAsync(Success), banner swaps in, keyboard dismisses. |
| Logged banner | 44 h r14 goodBg, check + Archivo value. role status. Enters FadeInDown 220 ms. |
| TrendSummary · Card | overline, Archivo 34/800 trend kg, rate Archivo 20/800 coloured by pace level, pace sentence 14/19 with level icon. |
| PaceText levels | good on pace (±10 % of goal) · warn slower · info faster · alert wrong direction. Same copy feeds Today’s On track? insight. |
| WeightTrendChart · weight-chart.tsx | 329 × 150 react-native-svg. Dots 3.5 text3 (latest 5 accentLine), trend = smoothed EWMA path 3 pt accentLine, goal = dashed 1.6 text3, gridlines line. X labels 11 text3. Trend path draws in 600 ms (strokeDashoffset). |
| RecentList · Row | 44 h rows, hairline between. Date 15, kg Archivo 15/700, change 13/600 (gains in warn). Swipe to delete. |
| Not enough data | Under 3 readings in 7 days: dashed empty chart, one dot, 1-of-3 progress dots, plain explanation. No rate shown. |
| Accessibility | Chart has a summary label (range, rate, direction). Pace icon shape differs per level. |

## WHOOP history (sheet)

Boards: `WhoopImport.dc.html` (+ `-Light` wrapper).

**States:**
- How-to + Choose export file
- Working: progress
- Preview: file, count, date range, columns, What it learned per activity, Import
- Success

**Spec:**

| Element | Spec |
|---|---|
| Presentation | Stack.Screen whoop-import, presentation modal (pageSheet), native header title “WHOOP history”, close = SF xmark in a 36 pt circle (44 hit). Swipe-down is blocked while reading (gestureEnabled false). |
| Intro | Title 22/28 700, body 15/21 text2, 4 pt inset from the card edge. |
| StepList (new) | Card r22, pad 6/16. Row pad 12, 28 pt number disc (raised, Archivo 800 14). Title 15/600, detail 13/18 text2. Hairline between rows. |
| Privacy note | Raised r16, pad 12/14, shield glyph 18 text2, 13/18 copy. Not tappable. |
| Last import | 13/18 text3, tabular. Hidden on first import. |
| Sticky action | Button L 56 h r18 pinned 34 pt above the bottom (safe area). Content gets bottom padding 106 so nothing hides under it. |
| Choose export file | expo-document-picker, types application/zip + text/csv, copyToCacheDirectory true. Cancelled picker = no state change. |
| Reading | Parse on device, report progress every 50 rows to a shared value; the bar animates width with withTiming 200 ms. aria-live polite on the card. |
| Cancel | Button L secondary. Stops parsing and returns to state 1. The header close is disabled (40 %) while reading. |
| File chip | Row 64 h, 40 pt icon tile r12, name 15/600 with middle-ellipsis, meta 13/18. |
| Preview stats | 2-up grid. num.m 22/26 Archivo 800 for counts; ranges 15/700 Archivo. Column chips 26 h pill, 12/500. |
| LearnedRow (new) | 36 pt training tile r11, name 15/600, meta 13/18; right side rate Archivo 800 15 in training colour, per-session 12/16. Rows enter FadeInDown 220 ms, stagger 40. |
| Skipped note | 12/17 text3. Fewer than 3 sessions per activity are ignored. |
| Import | Primary label carries the count (“Import 90 sessions”). Spinner while saving. Then Haptics success and state 4. |
| Success | 96 pt goodBg disc, check 46 good, title 26/32 with Archivo count. What changed rows in training colour. Done closes the sheet; Today’s estimate updates with a 600 ms count-up. |
| Errors | Wrong file or no workouts.csv: ErrorText under the action, “That ZIP has no workouts.csv. Export from WHOOP › Data export.” Keep the file picker one tap away. |

## Sign in (screen)

Boards: `SignIn.dc.html` (+ `-Light` wrapper).

**States:**
- Sign in
- Create account with an error, above the keyboard
- Check your email

**Spec:**

| Element | Spec |
|---|---|
| Screen | sign-in route, headerShown false. Existing Screen (ScrollView) with 24 pt gutter, automaticallyAdjustKeyboardInsets, keyboardShouldPersistTaps handled. |
| BrandMark (new) | react-native-svg: 76 pt tile r17, surface fill, open-C arc in accentLine, stroke 28/180. Compact variant 36 pt next to a 24/28 wordmark once the keyboard is up. |
| Wordmark | Archivo 800 40/44, tracking −1.2. Only the C is coloured (accentText). Strap line SF 16/22 text2. |
| Keyboard shift | On keyboardWillShow the large header cross-fades to the compact row (200 ms) so the form and button stay visible. Reverses on hide. |
| Mode segmented | Segmented 44 h, Sign in / Create account. Switching swaps the button label and password hint, FadeIn 160 ms. No route change. |
| Email field | Field 52 h r14. keyboardType email-address, autoCapitalize none, autoComplete email, textContentType username, returnKeyType next. |
| Password field | secureTextEntry. textContentType password (sign in) / newPassword (create) so iOS offers a strong password. returnKeyType go submits. |
| Primary button | Button L 56 h r18 accent. Disabled (40 %) until the email is valid and the password has 8+ characters. Loading shows a spinner and keeps its width. |
| ErrorText | 13/18 alert with an octagon icon. Field border 2 pt alert, aria-invalid. Enters FadeIn 160 ms and one Haptics.notificationAsync(Error). Clears on edit. |
| Server errors | Same ErrorText slot: “Wrong email or password.” / “That email already has an account. Sign in instead?” with an inline link that flips the mode. |
| Forgot password | Text button 15/600 accentText, 44 h. Sends a reset email and shows the check-your-email state with reset copy. |
| Check your email | Shown after sign-up when confirmation is needed. 96 pt goodBg circle, mail glyph. Title 28/34 700, body 16/22. Buttons pinned 48 pt above the home indicator. |
| Open Mail | Linking.openURL('message://'). Hidden if it cannot open. Resend: ghost, disabled with a 60 s countdown in Archivo tabular, then enabled. |
| Deep link | The confirmation link opens the app (scheme in app.json), the session is set, and the root Stack.Protected guard moves to (tabs) with no extra tap. |

---

Design system boards: `Tokens.dc.html` (contrast is computed live), `Type.dc.html` (type, spacing, radii, elevation, motion), `Components.dc.html` (every state), `Brand.dc.html` (wordmark, app icon light/dark/tinted, SF Symbol names).
