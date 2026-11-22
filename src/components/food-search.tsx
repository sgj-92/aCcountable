import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { Icon } from '@/components/icon';
import { Overline } from '@/components/sheet';
import { Skeleton } from '@/components/skeleton';
import { Button, Card, ErrorText, fmt, Num, Row, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { estimateFoods, lookupBarcode, searchFoods, type FoodResult, type FoodSearchResponse } from '@/lib/foods';

/**
 * Search USDA (whole foods) + Open Food Facts (branded foods) by name, or scan
 * a barcode. Calls `onSelect` with the chosen food.
 */
export function FoodSearch({ onSelect }: { onSelect: (food: FoodResult) => void }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResults, setAiResults] = useState<FoodResult[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  async function askAi() {
    const q = query.trim();
    if (q.length < 2) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await estimateFoods(q);
      setAiResults(r);
      if (r.length === 0) setAiError('The AI couldn’t find a food in that. Try describing it differently.');
    } catch (e) {
      setAiResults(null);
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

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
      <Row gap={Spacing.sm}>
        <View
          style={{
            flex: 1,
            height: 52,
            borderRadius: Radius.md,
            backgroundColor: c.raised,
            borderWidth: 2,
            borderColor: focused ? c.accentLine : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 12,
          }}>
          <Icon name="search" size={18} color={c.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search foods, e.g. chicken breast raw"
            placeholderTextColor={c.text3}
            selectionColor={c.accentLine}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search foods"
            style={{ flex: 1, height: '100%', color: c.text, fontSize: 17, paddingHorizontal: Spacing.sm }}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                setQuery('');
                setResults(null);
              }}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.text3, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={12} color={c.raised} strokeWidth={3} />
              </View>
            </Pressable>
          ) : null}
        </View>
        <Button
          title="Search"
          onPress={search}
          disabled={query.trim().length < 2 || busy}
          style={{ height: 52 }}
        />
      </Row>

      <Button
        title={aiBusy ? 'Asking AI…' : 'Ask AI for the calories'}
        icon="✨"
        variant="secondary"
        onPress={askAi}
        loading={aiBusy}
        disabled={query.trim().length < 2}
        style={{ height: 52 }}
      />
      {query.trim().length < 2 && !aiResults ? (
        <T variant="footnote" style={{ marginTop: -4, paddingHorizontal: 4 }}>
          Type what you had, e.g. “latte with full fat milk” or “2 eggs and toast”, then search or ask AI.
        </T>
      ) : null}
      {aiError ? (
        <T variant="footnote" color={c.alert}>
          {aiError}
        </T>
      ) : null}
      {aiResults && aiResults.length > 0 ? (
        <ResultSection title="AI estimate" badge="AI" items={aiResults} onSelect={onSelect} />
      ) : null}

      {scanning ? (
        <BarcodeScanner onScanned={onBarcode} onClose={() => setScanning(false)} />
      ) : (
        <Button title="Scan barcode" icon="▥" variant="secondary" onPress={() => setScanning(true)} style={{ height: 52 }} />
      )}

      <ErrorText message={error} />

      {busy ? (
        <>
          {[0, 1].map((s) => (
            <View key={s} style={{ gap: Spacing.sm }}>
              <Skeleton width={140} height={14} radius={7} />
              <Card style={{ gap: Spacing.md }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ gap: 6 }}>
                    <Skeleton width="70%" height={14} radius={7} />
                    <Skeleton width="45%" height={12} radius={6} />
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </>
      ) : null}

      {results && !busy ? (
        <>
          {results.errors.map((e) => (
            <T key={e} variant="footnote" color={c.warn}>
              {e} {aiResults ? '' : 'You can still ask AI for the calories.'}
            </T>
          ))}
          <ResultSection title="Whole foods" badge="USDA" items={results.usda} onSelect={onSelect} />
          <ResultSection title="Branded" badge="Open Food Facts" items={results.off} onSelect={onSelect} />
          {results.usda.length === 0 && results.off.length === 0 && results.errors.length === 0 ? (
            <T variant="footnote">No matches. Try fewer or different words.</T>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ResultSection({
  title,
  badge,
  items,
  onSelect,
}: {
  title: string;
  badge: string;
  items: FoodResult[];
  onSelect: (f: FoodResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 10);
  return (
    <View style={{ gap: Spacing.sm }}>
      <Overline badge={badge}>{title}</Overline>
      <Card style={{ gap: 0, paddingVertical: 4, paddingRight: Spacing.sm }}>
        {shown.map((f, i) => (
          <ResultRow key={f.id} food={f} first={i === 0} onPress={() => onSelect(f)} />
        ))}
        {items.length > shown.length ? (
          <Button
            title={`Show ${items.length - shown.length} more`}
            variant="ghost"
            size="S"
            onPress={() => setExpanded(true)}
            style={{ alignSelf: 'flex-start', marginVertical: Spacing.sm }}
          />
        ) : null}
      </Card>
    </View>
  );
}

function ResultRow({ food, first, onPress }: { food: FoodResult; first: boolean; onPress: () => void }) {
  const c = useTheme();
  const p = food.per100g;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${food.name}${food.brand ? `, ${food.brand}` : ''}, ${fmt(p.kcal)} kcal per 100 grams`}
      style={({ pressed }) => ({
        minHeight: 60,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        opacity: pressed ? 0.6 : 1,
      })}>
      <View style={{ flex: 1, gap: 2 }}>
        <T numberOfLines={2}>{food.name}</T>
        {food.brand ? (
          <T variant="footnote" numberOfLines={1}>
            {food.brand}
          </T>
        ) : null}
        <T variant="footnote" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
          P {fmt(p.protein_g)} · C {fmt(p.carbs_g)} · F {fmt(p.fat_g)} per 100 g
        </T>
        {food.source === 'ai' && food.servings[0] ? (
          <T variant="footnote" color={c.text} style={{ fontVariant: ['tabular-nums'] }}>
            {food.servings[0].label} · {fmt(food.servings[0].grams)} g ≈ {fmt((p.kcal * food.servings[0].grams) / 100)} kcal
          </T>
        ) : null}
        {food.incomplete ? (
          <Row gap={4}>
            <Icon name="warn" size={13} color={c.warn} strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: c.warn }}>Some values missing</Text>
          </Row>
        ) : null}
      </View>
      <Num size="s">{fmt(p.kcal)}</Num>
      <Icon name="chevron-right" size={16} color={c.text3} strokeWidth={2.2} />
    </Pressable>
  );
}
