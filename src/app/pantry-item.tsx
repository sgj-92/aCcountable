import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { CountStepper, FOOTER_SPACE, GramsField, Overline, SheetFooter, SourceBadge } from '@/components/sheet';
import { Button, Card, Chip, ErrorText, Field, fmt, Loading, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useMealSlots } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import type { Meal } from '@/lib/api';
import { deletePantryItem, getPantryItem, portionKcal, updatePantryItem, type PantryItem } from '@/lib/pantry';

const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const SOURCE: Record<PantryItem['source'], string> = { ai: 'AI estimate', usda: 'USDA', off: 'Open Food Facts', manual: 'Your values' };

/** Edit a pantry food: name, nutrition per 100 g, usual portion and usual meals. */
export default function PantryItemScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const slots = useMealSlots();
  const [item, setItem] = useState<PantryItem | null>(null);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [portion, setPortion] = useState('');
  const [meals, setMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPantryItem(id).then(
      (p) => {
        setItem(p);
        setName(p.name);
        setKcal(String(p.kcal_100g));
        setProtein(String(p.protein_100g));
        setCarbs(String(p.carbs_100g));
        setFat(String(p.fat_100g));
        setPortion(String(p.portion_g));
        setMeals(p.meals);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id]);

  if (!item) return <Screen padTop={false}>{error ? <ErrorText message={error} /> : <Loading />}</Screen>;

  const v = { kcal: num(kcal), p: num(protein), c: num(carbs), f: num(fat), g: num(portion) };
  const invalid = !name.trim()
    ? 'Give it a name'
    : [v.kcal, v.p, v.c, v.f].some((x) => !Number.isFinite(x) || x < 0)
      ? 'Nutrition values must be zero or more'
      : v.kcal > 950 || v.p > 100 || v.c > 100 || v.f > 100
        ? 'Those are per 100 g: macros can’t exceed 100 g'
        : !Number.isFinite(v.g) || v.g <= 0 || v.g > 5000
          ? 'Enter your usual portion in grams'
          : null;
  const unit = item.unit_name && item.unit_g ? { name: item.unit_name, grams: item.unit_g } : null;

  async function save() {
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await updatePantryItem(item!.id, {
        name: name.trim().slice(0, 200),
        kcal_100g: v.kcal,
        protein_100g: v.p,
        carbs_100g: v.c,
        fat_100g: v.f,
        portion_g: Math.round(v.g * 10) / 10,
        meals,
        // Hand-edited numbers are no longer the database's or the AI's.
        ...(kcal !== String(item!.kcal_100g) || protein !== String(item!.protein_100g) || carbs !== String(item!.carbs_100g) || fat !== String(item!.fat_100g)
          ? { source: 'manual' as const, source_ref: null }
          : {}),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const remove = () =>
    Alert.alert('Remove from pantry?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePantryItem(item.id);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const macro = (label: string, value: string, set: (s: string) => void, color: string) => (
    <View key={label} style={{ flex: 1, gap: 6 }}>
      <Row gap={5}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: c.text2 }}>{label}</Text>
      </Row>
      <TextInput
        value={value}
        onChangeText={set}
        keyboardType="decimal-pad"
        accessibilityLabel={`${label} per 100 grams`}
        selectionColor={c.accentLine}
        maxFontSizeMultiplier={1.3}
        style={{ height: 48, borderRadius: 12, backgroundColor: c.raised, color: c.text, paddingHorizontal: 10, fontFamily: 'Archivo_700Bold', fontSize: 16 }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Pantry food' }} />
      <Screen padTop={false} padBottom={FOOTER_SPACE + Spacing.xl}>
        <Field label="Name" value={name} onChangeText={setName} />
        <Row gap={Spacing.sm}>
          <SourceBadge label={SOURCE[item.source]} />
          <T variant="footnote" style={{ fontVariant: ['tabular-nums'] }}>
            Usual portion ≈ {Number.isFinite(v.g) && Number.isFinite(v.kcal) ? fmt(portionKcal({ kcal_100g: v.kcal }, v.g)) : '–'} kcal
          </T>
        </Row>

        <Overline>Usual portion</Overline>
        {unit ? (
          <CountStepper unit={unit} grams={Number.isFinite(v.g) ? v.g : unit.grams} onChange={(g) => setPortion(String(Math.round(g * 10) / 10))} />
        ) : null}
        <GramsField value={portion} onChangeText={setPortion} height={64} />

        <Overline>Usually eaten at</Overline>
        <Row style={{ flexWrap: 'wrap' }}>
          {slots.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={meals.includes(s.key)}
              onPress={() => setMeals(meals.includes(s.key) ? meals.filter((m) => m !== s.key) : [...meals, s.key])}
            />
          ))}
        </Row>
        <T variant="footnote" style={{ paddingHorizontal: 4 }}>
          {meals.length ? 'Shown first in Add food at these meals.' : 'None picked: listed under “Any time”.'}
        </T>

        <Overline>Nutrition per 100 g</Overline>
        <Card style={{ gap: Spacing.md }}>
          <Row gap={Spacing.sm} style={{ alignItems: 'flex-start' }}>
            {macro('kcal', kcal, setKcal, c.text2)}
            {macro('Protein', protein, setProtein, c.protein)}
            {macro('Carbs', carbs, setCarbs, c.carbs)}
            {macro('Fat', fat, setFat, c.fat)}
          </Row>
        </Card>
        <ErrorText message={invalid ?? error} />
        <Button title="Remove from pantry" variant="ghost" onPress={remove} style={{ alignSelf: 'center' }} />
      </Screen>
      <SheetFooter>
        <Button title="Save" size="L" onPress={save} loading={busy} disabled={!!invalid} />
      </SheetFooter>
    </View>
  );
}
