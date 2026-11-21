import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { MealPicker } from '@/components/meal-picker';
import { PressableScale } from '@/components/pressable-scale';
import { ConfidenceDot, FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Button, Card, ErrorText, Field, fmt, Num, Row, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { addFood, type Meal, type NewFoodEntry } from '@/lib/api';
import { isValidISODate, today } from '@/lib/dates';
import { SLOT_KEYS } from '@/lib/meals';
import { analyzeFood, prepareImage, type ScanResult, type ScanTurn } from '@/lib/scan';

interface EditableItem {
  include: boolean;
  name: string;
  portion: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  /** AI-estimated weight, kept so photo entries can be re-weighed later. */
  grams: number;
  confidence: 'low' | 'medium' | 'high';
}

const PORTIONS = [
  { label: '¼', value: 0.25 },
  { label: '½', value: 0.5 },
  { label: '¾', value: 0.75 },
  { label: 'All', value: 1 },
  { label: '1½', value: 1.5 },
  { label: '2×', value: 2 },
];

const toEditable = (r: ScanResult): EditableItem[] =>
  r.items.map((i) => ({
    include: true,
    name: i.name,
    portion: `${i.portion}${i.grams ? ` (~${Math.round(i.grams)} g)` : ''}`,
    kcal: String(Math.round(i.kcal)),
    protein: String(Math.round(i.protein_g)),
    carbs: String(Math.round(i.carbs_g)),
    fat: String(Math.round(i.fat_g)),
    grams: i.grams,
    confidence: i.confidence,
  }));

const n = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};
const round1 = (v: number) => Math.round(v * 10) / 10;
const totalKcal = (r: ScanResult) => r.items.reduce((s, i) => s + i.kcal, 0);
/** The AI's notes as one assumption per line. */
const assumptionsOf = (notes: string) =>
  notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

type Stage = 'preparing' | 'sending' | 'estimating';

export default function ScanScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const date = params.date && isValidISODate(params.date) ? params.date : today();
  const slots = useMealSlots();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();

  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  // The photo as sent to the AI (prepared once, reused for follow-ups), and the conversation so far.
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [turns, setTurns] = useState<ScanTurn[]>([]);
  const [reply, setReply] = useState('');
  const [refining, setRefining] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [meal, setMeal] = useState<Meal>(
    (SLOT_KEYS as readonly string[]).includes(params.meal ?? '') ? (params.meal as Meal) : 'snack',
  );
  const [portion, setPortion] = useState(1);
  const [combine, setCombine] = useState<'items' | 'one'>('items');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8 };
    let res: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera access needed', 'Enable camera access in Settings to scan meals.');
        return;
      }
      res = await ImagePicker.launchCameraAsync(options);
    } else {
      res = await ImagePicker.launchImageLibraryAsync(options);
    }
    if (!res.canceled && res.assets[0]) {
      setPhoto(res.assets[0].uri);
      setResult(null);
      setItems([]);
      setImageBase64(null);
      setTurns([]);
      setReply('');
      setEditing(null);
    }
  }

  async function analyse() {
    if (!photo) return;
    setError(null);
    try {
      setStage('preparing');
      const b64 = imageBase64 ?? (await prepareImage(photo));
      setImageBase64(b64);
      setStage('sending');
      const pending = analyzeFood(b64, note);
      setStage('estimating');
      const r = await pending;
      if (!r.is_food || r.items.length === 0) {
        setError("That doesn't look like food. Try another photo, or add the meal manually.");
        return;
      }
      setResult(r);
      setItems(toEditable(r));
      setPortion(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
    }
  }

  /** The estimate as it stands now, including any numbers edited by hand. */
  function currentEstimate(): ScanResult {
    return {
      ...result!,
      items: items
        .filter((i) => i.include && i.name.trim())
        .map((i) => ({
          name: i.name.trim(),
          portion: i.portion,
          grams: i.grams,
          kcal: n(i.kcal),
          protein_g: n(i.protein),
          carbs_g: n(i.carbs),
          fat_g: n(i.fat),
          confidence: i.confidence,
        })),
    };
  }

  async function refine() {
    if (!result || !imageBase64 || !reply.trim()) return;
    setRefining(true);
    setError(null);
    const next = [...turns, { previous: currentEstimate(), reply: reply.trim() }];
    try {
      const r = await analyzeFood(imageBase64, note, next);
      if (r.items.length === 0) {
        setError('The updated estimate came back empty. Try rephrasing, or edit the items directly.');
        return;
      }
      setTurns(next);
      setResult(r);
      setItems(toEditable(r));
      setEditing(null);
      setReply('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefining(false);
    }
  }

  const update = (idx: number, patch: Partial<EditableItem>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const included = items.filter((i) => i.include && i.name.trim());
  const totals = included.reduce(
    (t, i) => ({
      kcal: t.kcal + n(i.kcal) * portion,
      p: t.p + n(i.protein) * portion,
      c: t.c + n(i.carbs) * portion,
      f: t.f + n(i.fat) * portion,
      g: t.g + (i.grams || 0) * portion,
    }),
    { kcal: 0, p: 0, c: 0, f: 0, g: 0 },
  );
  const shownKcal = useCountUp(totals.kcal, 300);
  const mealLabel = slots.find((s) => s.key === meal)?.label ?? 'log';

  async function save() {
    if (!result || included.length === 0) return;
    setSaving(true);
    setError(null);
    const worst = included.some((i) => i.confidence === 'low')
      ? 'low'
      : included.some((i) => i.confidence === 'medium')
        ? 'medium'
        : 'high';
    const portionNote = portion !== 1 ? ` × ${PORTIONS.find((p) => p.value === portion)?.label ?? portion}` : '';
    const entries: NewFoodEntry[] =
      combine === 'one'
        ? [
            {
              date,
              meal,
              name: result.meal_name || 'Meal',
              serving: `${included.length} items${portionNote}`,
              kcal: Math.round(totals.kcal),
              protein_g: round1(totals.p),
              carbs_g: round1(totals.c),
              fat_g: round1(totals.f),
              grams: totals.g > 0 ? round1(totals.g) : null,
              source: 'photo',
              source_ref: null,
              ai_confidence: worst,
            },
          ]
        : included.map((i) => ({
            date,
            meal,
            name: i.name.trim(),
            serving: `${i.portion}${portionNote}`.trim() || null,
            kcal: Math.round(n(i.kcal) * portion),
            protein_g: round1(n(i.protein) * portion),
            carbs_g: round1(n(i.carbs) * portion),
            fat_g: round1(n(i.fat) * portion),
            grams: i.grams > 0 ? round1(i.grams * portion) : null,
            source: 'photo',
            source_ref: null,
            ai_confidence: i.confidence,
          }));
    try {
      await addFood(entries);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  // AI replies: what each of your corrections changed.
  const afterTurn = (i: number) => (i + 1 < turns.length ? turns[i + 1].previous : result);

  const footer = !photo ? null : !result ? (
    <Button
      title={stage ? 'Estimating…' : 'Estimate calories'}
      size="L"
      onPress={analyse}
      loading={!!stage}
    />
  ) : (
    <Button
      title={`Add ${fmt(totals.kcal)} kcal to ${mealLabel}`}
      size="L"
      onPress={save}
      loading={saving}
      disabled={included.length === 0}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingTop: Spacing.sm,
          paddingBottom: footer ? FOOTER_SPACE + Spacing.lg : insets.bottom + Spacing.xl,
          gap: Spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive">
        {!photo ? (
          <>
            <Card hero style={{ alignItems: 'center', paddingTop: Spacing.xxxl, paddingHorizontal: Spacing.xxl, paddingBottom: 28, gap: Spacing.md }}>
              <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="camera" size={34} color={c.accentText} strokeWidth={1.8} />
              </View>
              <T variant="title" style={{ textAlign: 'center' }}>
                Snap your meal
              </T>
              <T color={c.text2} style={{ textAlign: 'center', lineHeight: 21 }}>
                Shoot from above with the whole plate in frame. Cutlery or a hand in shot helps judge portion size.
              </T>
            </Card>
            <Button title="Take photo" size="L" icon="📷" onPress={() => pick('camera')} />
            <Button title="Choose from library" size="L" variant="secondary" onPress={() => pick('library')} />
          </>
        ) : (
          <>
            <PhotoView uri={photo} analysing={!!stage} />
            {stage ? <Steps stage={stage} /> : null}
            {!stage ? (
              <Row>
                <Button title="Retake" variant="secondary" onPress={() => pick('camera')} style={{ flex: 1 }} />
                <Button title="Library" variant="secondary" onPress={() => pick('library')} style={{ flex: 1 }} />
              </Row>
            ) : null}
          </>
        )}

        {photo && !result && !stage ? (
          <Field
            label="Anything the photo can’t show? · Optional"
            placeholder="e.g. 200 g chicken, cooked in 1 tbsp olive oil"
            value={note}
            onChangeText={setNote}
            multiline
          />
        ) : null}

        <ErrorText message={error} />

        {result ? (
          <>
            <Card hero style={{ gap: Spacing.md }}>
              <Row gap={Spacing.md}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: Radius.md }} contentFit="cover" />
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="headline" numberOfLines={2}>
                    {result.meal_name}
                  </T>
                  <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
                    P {fmt(totals.p)} · C {fmt(totals.c)} · F {fmt(totals.f)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Num size="m" style={{ fontSize: 26, lineHeight: 30 }}>
                    {fmt(shownKcal)}
                  </Num>
                  <T variant="caption" style={{ fontWeight: '400' }}>
                    kcal
                  </T>
                </View>
              </Row>
              {result.notes ? (
                <View style={{ gap: 6 }}>
                  <Overline>What it assumed</Overline>
                  {assumptionsOf(result.notes).map((a, i) => (
                    <Row key={i} gap={Spacing.sm} style={{ alignItems: 'flex-start', paddingHorizontal: 4 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.info, marginTop: 7 }} />
                      <T style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{a}</T>
                    </Row>
                  ))}
                </View>
              ) : null}

              {turns.map((t, i) => {
                const after = afterTurn(i);
                const delta = after ? Math.round(totalKcal(after) - totalKcal(t.previous)) : 0;
                return (
                  <View key={i} style={{ gap: 6 }}>
                    <Bubble mine text={t.reply} />
                    <Bubble
                      text={
                        delta === 0
                          ? 'Updated. The total stayed the same.'
                          : `Updated: ${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))} kcal.`
                      }
                    />
                  </View>
                );
              })}

              <T variant="footnote">Got something wrong? Tell it, and it’ll update the estimate.</T>
              <Row gap={Spacing.sm} style={{ alignItems: 'flex-end' }}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="e.g. no butter, rice was 150 g"
                  placeholderTextColor={c.text3}
                  selectionColor={c.accentLine}
                  multiline
                  accessibilityLabel="Reply to the estimate"
                  onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    maxHeight: 120,
                    borderRadius: 24,
                    backgroundColor: c.raised,
                    color: c.text,
                    paddingHorizontal: Spacing.lg,
                    paddingTop: 13,
                    paddingBottom: 13,
                    fontSize: 16,
                  }}
                />
                <Button
                  title="Update"
                  onPress={refine}
                  loading={refining}
                  disabled={!reply.trim()}
                  style={{ height: 48, borderRadius: 24 }}
                />
              </Row>
            </Card>

            <Overline>Items</Overline>
            <Card style={{ paddingVertical: 4, gap: 0 }}>
              {items.map((it, idx) => (
                <ScanItemRow
                  key={idx}
                  item={it}
                  first={idx === 0}
                  portion={portion}
                  editing={editing === idx}
                  onToggleEdit={() => setEditing(editing === idx ? null : idx)}
                  onChange={(patch) => update(idx, patch)}
                />
              ))}
            </Card>

            <Overline>How much did you eat?</Overline>
            <Row gap={6}>
              {PORTIONS.map((p) => {
                const active = portion === p.value;
                return (
                  <PressableScale
                    key={p.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Portion ${p.label}`}
                    onPress={() => setPortion(p.value)}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? c.accent : c.raised,
                    }}>
                    <Text style={{ fontFamily: 'Archivo_700Bold', fontSize: 14, color: active ? c.onAccent : c.text }}>
                      {p.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </Row>

            <Overline>Meal</Overline>
            <MealPicker value={meal} onChange={setMeal} />
            <Segmented
              value={combine}
              onChange={setCombine}
              options={[
                { label: 'Separate items', value: 'items' },
                { label: 'As one meal', value: 'one' },
              ]}
            />
          </>
        ) : null}
      </ScrollView>
      {footer ? <SheetFooter>{footer}</SheetFooter> : null}
    </View>
  );
}

function PhotoView({ uri, analysing }: { uri: string; analysing: boolean }) {
  const c = useTheme();
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!analysing || reduceMotion || h === 0) return;
    sweep.set(0);
    sweep.set(withRepeat(withTiming(h, { duration: 1200, easing: Easing.linear }), -1, false));
  }, [analysing, reduceMotion, h, sweep]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.get() - 44 }] }));

  return (
    <View
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 20, overflow: 'hidden', backgroundColor: c.raised }}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%', opacity: analysing ? 0.45 : 1 }} contentFit="cover" />
      {analysing && !reduceMotion ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 46 }, band]}>
          <View style={{ height: 44, backgroundColor: c.goodBg }} />
          <View style={{ height: 2, backgroundColor: c.accentLine }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const STEPS: { key: Stage; label: string }[] = [
  { key: 'preparing', label: 'Preparing the photo' },
  { key: 'sending', label: 'Sending it to the AI' },
  { key: 'estimating', label: 'Identifying foods and portions' },
];

function Steps({ stage }: { stage: Stage }) {
  const c = useTheme();
  const current = STEPS.findIndex((s) => s.key === stage);
  return (
    <Card>
      <View accessibilityLiveRegion="polite" style={{ gap: Spacing.md }}>
      {STEPS.map((s, i) => (
        <Animated.View key={s.key} entering={FadeIn.duration(220)} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            {i < current ? (
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color={c.accentText} strokeWidth={2.6} />
              </View>
            ) : i === current ? (
              <ActivityIndicator size="small" color={c.accentLine} />
            ) : (
              <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.text3 }} />
            )}
          </View>
          <T color={i > current ? c.text3 : c.text} style={{ fontWeight: i === current ? '600' : '400' }}>
            {s.label}
          </T>
        </Animated.View>
      ))}
      </View>
    </Card>
  );
}

function Bubble({ text, mine }: { text: string; mine?: boolean }) {
  const c = useTheme();
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: 280,
        paddingHorizontal: 14,
        paddingVertical: 9,
        backgroundColor: mine ? c.raised : c.goodBg,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: mine ? 18 : 6,
        borderBottomRightRadius: mine ? 6 : 18,
      }}>
      <T style={{ fontSize: 14, lineHeight: 19 }}>{text}</T>
    </View>
  );
}

function ScanItemRow({
  item,
  first,
  portion,
  editing,
  onToggleEdit,
  onChange,
}: {
  item: EditableItem;
  first: boolean;
  portion: number;
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (patch: Partial<EditableItem>) => void;
}) {
  const c = useTheme();
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <Row gap={Spacing.md} style={{ minHeight: 60, opacity: item.include ? 1 : 0.45 }}>
        <ConfidenceDot level={item.confidence} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.confidence} confidence. Edit`}
          onPress={onToggleEdit}
          disabled={!item.include}
          style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
          <T numberOfLines={1}>{item.name}</T>
          <T variant="footnote" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
            {item.portion} · P {fmt(n(item.protein) * portion)} · C {fmt(n(item.carbs) * portion)} · F {fmt(n(item.fat) * portion)}
          </T>
        </Pressable>
        <Num size="xs">{fmt(n(item.kcal) * portion)}</Num>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={item.include ? `Remove ${item.name}` : `Put back ${item.name}`}
          onPress={() => onChange({ include: !item.include })}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          {item.include ? (
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.alert, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: c.alert }} />
            </View>
          ) : (
            <T color={c.accentText} style={{ fontSize: 13, fontWeight: '700' }}>
              Undo
            </T>
          )}
        </PressableScale>
      </Row>
      {editing && item.include ? (
        <View style={{ gap: Spacing.sm, paddingBottom: Spacing.md }}>
          <Field label="Item" value={item.name} onChangeText={(v) => onChange({ name: v })} />
          <Field label="Portion" value={item.portion} onChangeText={(v) => onChange({ portion: v })} />
          <Row gap={Spacing.sm}>
            <Field style={{ flex: 1.2 }} label="kcal" value={item.kcal} onChangeText={(v) => onChange({ kcal: v })} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="P g" value={item.protein} onChangeText={(v) => onChange({ protein: v })} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="C g" value={item.carbs} onChangeText={(v) => onChange({ carbs: v })} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="F g" value={item.fat} onChangeText={(v) => onChange({ fat: v })} keyboardType="decimal-pad" />
          </Row>
          <T variant="footnote">Amounts are for the whole item; “How much did you eat?” scales them.</T>
        </View>
      ) : null}
    </View>
  );
}
