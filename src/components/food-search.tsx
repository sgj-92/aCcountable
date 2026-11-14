import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { Button, Card, Divider, ErrorText, fmt, Row, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lookupBarcode, searchFoods, type FoodResult, type FoodSearchResponse } from '@/lib/foods';

/**
 * Search USDA (whole foods) + Open Food Facts (branded foods) by name, or scan
 * a barcode. Calls `onSelect` with the chosen food.
 */
export function FoodSearch({ onSelect }: { onSelect: (food: FoodResult) => void }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchFoods(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onBarcode(code: string) {
    setScanning(false);
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const r = await lookupBarcode(code);
      const all = [...r.off, ...r.usda];
      if (all.length === 1) {
        onSelect(all[0]);
      } else if (all.length === 0) {
        setError(
          r.errors.length
            ? r.errors.join(' ')
            : `No product found for barcode ${code}. Try searching by name, or enter it manually.`,
        );
      } else {
        setResults(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <Row>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          placeholder="Search foods, e.g. chicken breast raw"
          placeholderTextColor={c.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search foods"
          style={{
            flex: 1,
            backgroundColor: c.card,
            color: c.text,
            borderRadius: Radius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: 12,
            fontSize: 16,
          }}
        />
        <Button title="Search" onPress={search} disabled={query.trim().length < 2 || busy} />
      </Row>

      {scanning ? (
        <BarcodeScanner onScanned={onBarcode} onClose={() => setScanning(false)} />
      ) : (
        <Button title="Scan barcode" icon="▥" variant="secondary" onPress={() => setScanning(true)} />
      )}

      {busy ? (
        <Row style={{ justifyContent: 'center', paddingVertical: Spacing.md }} gap={Spacing.md}>
          <ActivityIndicator color={c.primary} />
          <T variant="muted">Searching…</T>
        </Row>
      ) : null}
      <ErrorText message={error} />

      {results && !busy ? (
        <>
          {results.errors.map((e) => (
            <T key={e} variant="small" color={c.danger}>
              {e}
            </T>
          ))}
          <ResultSection title="Whole foods" subtitle="USDA FoodData Central" items={results.usda} onSelect={onSelect} />
          <ResultSection title="Branded & packaged" subtitle="Open Food Facts" items={results.off} onSelect={onSelect} />
          {results.usda.length === 0 && results.off.length === 0 && results.errors.length === 0 ? (
            <T variant="muted">No matches. Try fewer or different words.</T>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ResultSection({
  title,
  subtitle,
  items,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: FoodResult[];
  onSelect: (f: FoodResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 6);
  return (
    <Card style={{ gap: 0 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: Spacing.xs }}>
        <T variant="heading">{title}</T>
        <T variant="small">{subtitle}</T>
      </Row>
      {shown.map((f, i) => (
        <View key={f.id}>
          {i > 0 ? <Divider /> : null}
          <ResultRow food={f} onPress={() => onSelect(f)} />
        </View>
      ))}
      {items.length > shown.length ? (
        <Button title={`Show ${items.length - shown.length} more`} variant="ghost" onPress={() => setExpanded(true)} />
      ) : null}
    </Card>
  );
}

function ResultRow({ food, onPress }: { food: FoodResult; onPress: () => void }) {
  const c = useTheme();
  const p = food.per100g;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: Spacing.sm }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={Spacing.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <T numberOfLines={2}>{food.name}</T>
          <T variant="small" numberOfLines={1}>
            {food.brand ? `${food.brand} · ` : ''}P {fmt(p.protein_g)} · C {fmt(p.carbs_g)} · F {fmt(p.fat_g)}
            {food.incomplete ? ' · some values missing' : ''}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T color={c.text}>{fmt(p.kcal)}</T>
          <T variant="small">kcal/100 g</T>
        </View>
      </Row>
    </Pressable>
  );
}
