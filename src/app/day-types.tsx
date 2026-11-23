import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Switch, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Button, Card, ErrorText, fmt, Loading, Num, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { getProfile, isProfileComplete, listWhoopWorkouts } from '@/lib/api';
import { today } from '@/lib/dates';
import { buildDayTypes } from '@/lib/day-type-builder';
import { listDayTypes, mealTotals, parseDayTypes, saveDayType, type DayType, type NewDayType } from '@/lib/day-types';
import { listPantry, savePantryItems, type PantryItem } from '@/lib/pantry';
import { amountLabel } from '@/lib/plans';
import { activityName, ratesForModel, ratesFromRows } from '@/lib/whoop';

const EXAMPLE = `Rest day: 2,000 kcal, 180 g protein, 200 g carbs, 60 g fat
Meal 1: 3 eggs, 50 g oats, 30 g whey
Meal 2: 150 g chicken breast, 80 g basmati rice (dry), broccoli
Meal 3: 160 g salmon, 250 g potatoes, green beans
Snacks: 170 g Greek yoghurt, 1 gluten free muffin

Padel day (90 min padel): 2,400 kcal, 180 P, 270 C, 67 F
Same as rest day but 120 g rice and add a banana before padel`;

/** Your day types: the kinds of day agreed with your coach, with their targets, training and meals. */
export default function DayTypesScreen() {
  const c = useTheme();
  const slots = useMealSlots();
  const { data, error, reload } = useAsync(async () => {
    const [dayTypes, pantry, whoop, profile] = await Promise.all([
      listDayTypes(),
      listPantry().catch(() => [] as PantryItem[]),
      listWhoopWorkouts().catch(() => []),
      getProfile(),
    ]);
    const rates = ratesFromRows(whoop);
    return { dayTypes, pantry, profile, rates, whoopNames: rates.byName.map((r) => r.label) };
  }, 'day-types');
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<(NewDayType & { include: boolean })[] | null>(null);
  const [notes, setNotes] = useState('');
  const [addToPantry, setAddToPantry] = useState(true);

  async function read() {
    if (!data || text.trim().length < 2) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await parseDayTypes(
        text.trim(),
        slots.map((s) => ({ key: s.key, label: s.label })),
        data.pantry,
        data.whoopNames,
      );
      if (r.dayTypes.length === 0) {
        setActionError('The AI couldn’t find any day types in that. Name each kind of day and list its meals.');
        return;
      }
      setDrafts(r.dayTypes.map((d) => ({ ...d, include: true })));
      setNotes(r.notes);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Day types worked out from your goal, usual training and pantry. */
  function buildForMe() {
    if (!data) return;
    setActionError(null);
    if (!isProfileComplete(data.profile)) {
      setActionError('Complete your profile first: your targets come from it.');
      return;
    }
    const built = buildDayTypes(
      data.profile,
      ratesForModel(data.rates.byActivity, data.rates.byName),
      data.rates.byName,
      data.pantry,
      today(),
    );
    const filed = data.pantry.filter((p) => p.meals.length > 0).length;
    setNotes(
      [
        'Rest day is your goal’s rest-day target. Each training day adds what that session usually burns (from your WHOOP history), as carbs; protein and fat stay the same.',
        filed === 0
          ? 'No meals yet: add foods to your pantry with the meals you usually have them at, then build again.'
          : 'Meals use your pantry foods filed under each meal, sized to hit each day’s target.',
        data.dayTypes.some((d) => built.some((b) => b.name === d.name)) ? 'Saving replaces your existing day types with the same names.' : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    setDrafts(built.map((d) => ({ ...d, include: true })));
  }

  async function saveDrafts() {
    const chosen = (drafts ?? []).filter((d) => d.include);
    if (!chosen.length || !data) return;
    setBusy(true);
    setActionError(null);
    try {
      const start = data.dayTypes.length;
      for (const [i, { include: _include, ...d }] of chosen.entries()) {
        await saveDayType({ ...d, position: start + i });
      }
      if (addToPantry) {
        const known = new Set(data.pantry.map((p) => p.name.toLowerCase()));
        const fresh = new Map<string, NewDayType['meals'][number]>();
        for (const d of chosen) for (const f of d.meals) if (!f.pantry_id && !known.has(f.name.toLowerCase())) fresh.set(f.name.toLowerCase(), f);
        await savePantryItems(
          [...fresh.values()].map((f) => ({
            name: f.name,
            kcal_100g: f.kcal_100g,
            protein_100g: f.protein_100g,
            carbs_100g: f.carbs_100g,
            fat_100g: f.fat_100g,
            portion_g: f.grams,
            unit_name: f.unit_name,
            unit_g: f.unit_g,
            meals: [f.meal],
            source: f.source,
            source_ref: f.source_ref,
          })),
        ).catch(() => {});
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDrafts(null);
      setText('');
      setPasting(false);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const footer = drafts ? (
    <Button
      title={`Save ${drafts.filter((d) => d.include).length} day type${drafts.filter((d) => d.include).length === 1 ? '' : 's'}`}
      size="L"
      onPress={saveDrafts}
      loading={busy}
      disabled={!drafts.some((d) => d.include)}
    />
  ) : pasting ? (
    <Button title={busy ? 'Reading your plan…' : 'Read my plan'} icon="✨" size="L" onPress={read} loading={busy} disabled={text.trim().length < 2} />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Day types' }} />
      <Screen padTop={false} padBottom={footer ? FOOTER_SPACE + Spacing.xl : undefined}>
        {!data ? (
          error ? <ErrorText message={error} /> : <Loading />
        ) : drafts ? (
          <>
            {notes ? (
              <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                {notes}
              </T>
            ) : null}
            {drafts.map((d, i) => (
              <DayTypeCard
                key={`${d.name}-${i}`}
                dayType={d}
                slots={slots}
                included={d.include}
                onToggle={() => setDrafts((all) => (all ?? []).map((x, j) => (j === i ? { ...x, include: !x.include } : x)))}
              />
            ))}
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>Add new foods to my pantry</T>
                <T variant="footnote">Foods that aren’t in your pantry yet, at these portions.</T>
              </View>
              <Switch value={addToPantry} onValueChange={setAddToPantry} trackColor={{ true: c.switchOn, false: c.track }} thumbColor="#FFFFFF" />
            </Card>
            <T variant="footnote" style={{ paddingHorizontal: 4 }}>
              You can fine-tune any day type after saving: targets, training, foods and portions.
            </T>
            <ErrorText message={actionError} />
            <Button title="Start over" variant="ghost" onPress={() => setDrafts(null)} style={{ alignSelf: 'center' }} />
          </>
        ) : (
          <>
            {pasting ? (
              <View style={{ gap: Spacing.sm }}>
                <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                  Paste the plan you agreed with your coach or with Claude. Name each kind of day, with its targets if you have
                  them, any training, and the meals with portions. Foods in your pantry are matched automatically.
                </T>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={EXAMPLE}
                  placeholderTextColor={c.text3}
                  selectionColor={c.accentLine}
                  multiline
                  autoFocus
                  maxLength={6000}
                  accessibilityLabel="Your agreed plan"
                  style={{
                    minHeight: 280,
                    backgroundColor: c.raised,
                    color: c.text,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingTop: 12,
                    paddingBottom: 12,
                    fontSize: 16,
                    lineHeight: 22,
                    textAlignVertical: 'top',
                  }}
                />
                <ErrorText message={actionError} />
                <Button title="Cancel" variant="ghost" onPress={() => setPasting(false)} style={{ alignSelf: 'center' }} />
              </View>
            ) : (
              <>
                <T variant="footnote" style={{ paddingHorizontal: 4 }}>
                  Each day type is a kind of day you agreed with your coach: its calorie and macro targets, the training it
                  assumes and the meals that make it up. Pick one on Today and the day is planned for you.
                </T>
                <Button title="Build them for me" icon="✨" size="L" onPress={buildForMe} />
                <Row gap={Spacing.sm}>
                  <Button title="Paste agreed plan" variant="secondary" onPress={() => setPasting(true)} style={{ flex: 1 }} />
                  <Button title="New day type" variant="secondary" onPress={() => router.push('/day-type')} style={{ flex: 1 }} />
                </Row>
                <ErrorText message={actionError} />
              </>
            )}
            {!pasting
              ? data.dayTypes.map((d) => (
                  <DayTypeCard key={d.id} dayType={d} slots={slots} onPress={() => router.push({ pathname: '/day-type', params: { id: d.id } })} />
                ))
              : null}
          </>
        )}
      </Screen>
      {footer ? <SheetFooter>{footer}</SheetFooter> : null}
    </View>
  );
}

function DayTypeCard({
  dayType: d,
  slots,
  onPress,
  included,
  onToggle,
}: {
  dayType: NewDayType | DayType;
  slots: { key: string; label: string }[];
  onPress?: () => void;
  /** Draft review: whether it will be saved. */
  included?: boolean;
  onToggle?: () => void;
}) {
  const c = useTheme();
  const totals = mealTotals(d);
  const off = Math.round(totals.kcal - d.kcal);
  const training = d.sessions.length
    ? d.sessions.map((s) => `${activityName(s.whoop_activity, s.activity)} ${s.duration_min}′ ${s.intensity}`).join(' + ')
    : 'No training';
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress}>
      <Card hero style={{ gap: Spacing.sm, opacity: included === false ? 0.45 : 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="headline" style={{ flex: 1 }}>
            {d.name}
          </T>
          {onToggle ? (
            <Pressable accessibilityRole="button" onPress={onToggle} hitSlop={8}>
              <T color={included ? c.alert : c.accentText} style={{ fontWeight: '600' }}>
                {included ? 'Leave out' : 'Include'}
              </T>
            </Pressable>
          ) : (
            <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} />
          )}
        </Row>
        <Row gap={Spacing.sm} style={{ alignItems: 'baseline' }}>
          <Num size="m">{fmt(d.kcal)}</Num>
          <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
            kcal · P {d.protein_g} · C {d.carbs_g} · F {d.fat_g} g
          </T>
        </Row>
        <T variant="footnote" color={c.training}>
          {training}
        </T>
        {slots
          .filter((s) => d.meals.some((m) => m.meal === s.key))
          .map((s) => (
            <View key={s.key} style={{ gap: 2 }}>
              <Overline>{s.label}</Overline>
              {d.meals
                .filter((m) => m.meal === s.key)
                .map((m, i) => (
                  <Row key={`${m.name}-${i}`} style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
                    <T style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                      {m.name}
                      {m.pantry_id ? '' : ' · new'}
                    </T>
                    <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                      {amountLabel(m, m.grams)} · {fmt((m.kcal_100g * m.grams) / 100)}
                    </T>
                  </Row>
                ))}
            </View>
          ))}
        {d.meals.length ? (
          <T variant="footnote" color={Math.abs(off) > 150 ? c.warn : c.text2} style={{ fontVariant: ['tabular-nums'] }}>
            Meals add up to {fmt(totals.kcal)} kcal
            {Math.abs(off) <= 50 ? ', on target.' : ` (${off > 0 ? '+' : '−'}${fmt(Math.abs(off))} vs target): the plan re-balances portions each day.`}
          </T>
        ) : (
          <T variant="footnote">No meals yet.</T>
        )}
      </Card>
    </Pressable>
  );
}
