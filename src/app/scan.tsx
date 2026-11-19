import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, TextInput, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, fmt, Row, Screen, Segmented, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MealPicker } from '@/components/meal-picker';
import { addFood, type Meal, type NewFoodEntry } from '@/lib/api';
import { SLOT_KEYS } from '@/lib/meals';
import { isValidISODate, today } from '@/lib/dates';
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

export default function ScanScreen() {
  const c = useTheme();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const date = params.date && isValidISODate(params.date) ? params.date : today();

  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  // The photo as sent to the AI (prepared once, reused for follow-ups), and the conversation so far.
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [turns, setTurns] = useState<ScanTurn[]>([]);
  const [reply, setReply] = useState('');
  const [refining, setRefining] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
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
    }
  }

  async function analyse() {
    if (!photo) return;
    setAnalysing(true);
    setError(null);
    try {
      const b64 = imageBase64 ?? (await prepareImage(photo));
      setImageBase64(b64);
      const r = await analyzeFood(b64, note);
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
      setAnalysing(false);
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
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const confidenceColor = (conf: EditableItem['confidence']) =>
    conf === 'high' ? c.success : conf === 'medium' ? c.fat : c.danger;

  return (
    <Screen padTop={false}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.lg, backgroundColor: c.input }}
          contentFit="cover"
        />
      ) : (
        <Card style={{ alignItems: 'center', paddingVertical: Spacing.xxl }}>
          <T style={{ fontSize: 48 }}>📷</T>
          <T variant="heading">Snap your meal</T>
          <T variant="muted" style={{ textAlign: 'center' }}>
            Shoot from above with the whole plate in frame. Cutlery or a hand in shot helps judge portion size.
          </T>
        </Card>
      )}

      <Row>
        <Button title={photo ? 'Retake' : 'Take photo'} onPress={() => pick('camera')} style={{ flex: 1 }} variant={photo ? 'secondary' : 'primary'} />
        <Button title="Library" onPress={() => pick('library')} style={{ flex: 1 }} variant="secondary" />
      </Row>

      {photo && !result ? (
        <Card style={{ gap: Spacing.md }}>
          <Field
            label="Anything the photo can't show? (optional)"
            placeholder="e.g. 200 g chicken, cooked in 1 tbsp olive oil"
            value={note}
            onChangeText={setNote}
            multiline
          />
          {analysing ? (
            <Row style={{ justifyContent: 'center', paddingVertical: Spacing.md }} gap={Spacing.md}>
              <ActivityIndicator color={c.primary} />
              <T variant="muted">Analysing your meal…</T>
            </Row>
          ) : (
            <Button title="Analyse" icon="✨" onPress={analyse} />
          )}
        </Card>
      ) : null}

      <ErrorText message={error} />

      {result ? (
        <>
          <Card style={{ gap: Spacing.sm }}>
            <T variant="heading">{result.meal_name}</T>
            {result.notes ? <T variant="muted">{result.notes}</T> : null}
            {turns.map((t, i) => (
              <T key={i} variant="small" color={c.primary}>
                You: {t.reply}
              </T>
            ))}
            <T variant="small">Got something wrong? Tell it, and it’ll update the estimate. Or edit the items below.</T>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="e.g. the 288 g was raw weight, no butter used"
              placeholderTextColor={c.textMuted}
              multiline
              accessibilityLabel="Reply to the estimate"
              style={{
                minHeight: 64,
                backgroundColor: c.input,
                color: c.text,
                borderRadius: Radius.sm,
                padding: Spacing.md,
                fontSize: 16,
                textAlignVertical: 'top',
              }}
            />
            {refining ? (
              <Row style={{ justifyContent: 'center', paddingVertical: Spacing.sm }} gap={Spacing.md}>
                <ActivityIndicator color={c.primary} />
                <T variant="muted">Updating the estimate…</T>
              </Row>
            ) : (
              <Button title="Update estimate" variant="secondary" onPress={refine} disabled={!reply.trim()} />
            )}
          </Card>

          {items.map((it, idx) => (
            <Card key={idx} style={{ gap: Spacing.sm, opacity: it.include ? 1 : 0.5 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={Spacing.xs}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: confidenceColor(it.confidence) }} />
                  <T variant="small">{it.confidence} confidence</T>
                </Row>
                <Pressable onPress={() => update(idx, { include: !it.include })} hitSlop={8}>
                  <T color={it.include ? c.danger : c.primary}>{it.include ? 'Remove' : 'Include'}</T>
                </Pressable>
              </Row>
              <Field label="Item" value={it.name} onChangeText={(v) => update(idx, { name: v })} />
              <Field label="Portion" value={it.portion} onChangeText={(v) => update(idx, { portion: v })} />
              <Row gap={Spacing.sm}>
                <Field style={{ flex: 1.2 }} label="kcal" value={it.kcal} onChangeText={(v) => update(idx, { kcal: v })} keyboardType="decimal-pad" />
                <Field style={{ flex: 1 }} label="P g" value={it.protein} onChangeText={(v) => update(idx, { protein: v })} keyboardType="decimal-pad" />
                <Field style={{ flex: 1 }} label="C g" value={it.carbs} onChangeText={(v) => update(idx, { carbs: v })} keyboardType="decimal-pad" />
                <Field style={{ flex: 1 }} label="F g" value={it.fat} onChangeText={(v) => update(idx, { fat: v })} keyboardType="decimal-pad" />
              </Row>
            </Card>
          ))}

          <Card style={{ gap: Spacing.md }}>
            <View style={{ gap: Spacing.xs }}>
              <T variant="small">How much did you eat?</T>
              <Row style={{ flexWrap: 'wrap' }}>
                {PORTIONS.map((p) => (
                  <Chip key={p.label} label={p.label} active={portion === p.value} onPress={() => setPortion(p.value)} />
                ))}
              </Row>
            </View>
            <MealPicker value={meal} onChange={setMeal} />
            <Segmented
              value={combine}
              onChange={setCombine}
              options={[
                { label: 'Log separate items', value: 'items' },
                { label: 'Log as one meal', value: 'one' },
              ]}
            />
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="heading">{fmt(totals.kcal)} kcal</T>
              <T variant="muted">
                P {fmt(totals.p)} · C {fmt(totals.c)} · F {fmt(totals.f)}
              </T>
            </Row>
            <Button title="Add to log" onPress={save} loading={saving} disabled={included.length === 0} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
