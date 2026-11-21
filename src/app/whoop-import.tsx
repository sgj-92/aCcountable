import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { strFromU8, unzipSync } from 'fflate';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { FOOTER_SPACE, Overline, SheetFooter } from '@/components/sheet';
import { Button, Card, ErrorText, fmt, Num, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { confirmSession, listUnconfirmedSessions, listWhoopWorkouts, upsertWhoopWorkouts } from '@/lib/api';
import { formatDay } from '@/lib/dates';
import { ACTIVITY_LABELS } from '@/lib/nutrition';
import { burnRatesByName, matchToSessions, parseWhoopWorkouts, ratesFromRows, type ParsedExport } from '@/lib/whoop';

/** Reads workouts.csv out of a WHOOP export (.zip) or takes a CSV as is. */
async function readWorkoutsCsv(uri: string, name: string): Promise<string> {
  const file = new File(uri);
  if (name.toLowerCase().endsWith('.zip')) {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => f.name.toLowerCase().endsWith('.csv'),
    });
    const names = Object.keys(entries);
    const workouts = names.find((n) => /workouts?\.csv$/i.test(n)) ?? names.find((n) => /workout/i.test(n));
    if (!workouts) throw new Error(`No workouts CSV in that zip (found: ${names.join(', ') || 'no CSV files'}).`);
    return strFromU8(entries[workouts]);
  }
  return file.text();
}

export default function WhoopImport() {
  const c = useTheme();
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; confirmed: number } | null>(null);

  const existing = useAsync(listWhoopWorkouts, 'whoop');
  const existingRates = existing.data ? ratesFromRows(existing.data).byName : [];

  async function pick() {
    setError(null);
    setDone(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const csv = await readWorkoutsCsv(asset.uri, asset.name);
      const p = parseWhoopWorkouts(csv);
      if (p.workouts.length === 0) {
        throw new Error(
          'Couldn’t find workouts with calories in that file. Pick workouts.csv from your WHOOP export (or the export .zip).',
        );
      }
      setParsed(p);
      setFileName(asset.name);
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importNow() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      await upsertWhoopWorkouts(
        parsed.workouts.map((w) => ({
          started_at: w.startedAt,
          date: w.date,
          activity_name: w.activityName.slice(0, 80),
          activity: w.activity,
          duration_min: w.durationMin,
          kcal: w.kcal,
          strain: w.strain,
          avg_hr: w.avgHr,
        })),
      );
      // Fill in actual burns for planned sessions WHOOP recorded.
      const dates = parsed.workouts.map((w) => w.date).sort();
      const unconfirmed = await listUnconfirmedSessions(dates[0], dates[dates.length - 1]);
      const matches = matchToSessions(parsed.workouts, unconfirmed);
      for (const m of matches) await confirmSession(m.sessionId, m.workout.kcal, Math.round(m.workout.durationMin));
      setDone({ imported: parsed.workouts.length, confirmed: matches.length });
      setParsed(null);
      existing.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const preview = parsed ? burnRatesByName(parsed.workouts) : [];
  const dates = parsed ? parsed.workouts.map((w) => w.date).sort() : [];
  const lastImported = existing.data?.length ? existing.data.map((w) => w.date).sort().at(-1) : null;

  const footer = done ? (
    <Button title="Done" size="L" onPress={() => router.back()} />
  ) : parsed ? (
    <Button title={`Import ${fmt(parsed.workouts.length)} sessions`} size="L" onPress={importNow} loading={busy} />
  ) : (
    <Button title="Choose export file" size="L" onPress={pick} loading={busy} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'WHOOP history', gestureEnabled: !busy }} />
      <Screen padTop={false} padBottom={FOOTER_SPACE + Spacing.xl}>
        {done ? (
          <View style={{ alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xxl }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={46} color={c.good} strokeWidth={2.6} />
            </View>
            <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '700', color: c.text, textAlign: 'center' }}>
              Imported <Text style={{ fontFamily: 'Archivo_800ExtraBold' }}>{fmt(done.imported)}</Text> sessions
            </Text>
            <T color={c.text2} style={{ textAlign: 'center' }}>
              {done.confirmed > 0
                ? `${done.confirmed} planned session${done.confirmed === 1 ? '' : 's'} confirmed with WHOOP’s numbers.`
                : 'Session estimates now use your own burn rates.'}
            </T>
          </View>
        ) : null}

        {!parsed && !done ? (
          <>
            <View style={{ gap: Spacing.sm, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: c.text }}>Use your own burn rates</Text>
              <T color={c.text2} style={{ lineHeight: 21 }}>
                Your WHOOP activities appear first when you add a session, estimates come from your own history, and planned
                sessions WHOOP recorded are confirmed automatically.
              </T>
            </View>
            <Card style={{ paddingVertical: 6, gap: 0, borderRadius: 22 }}>
              {STEPS.map((st, i) => (
                <Row key={st.title} gap={Spacing.md} style={{ paddingVertical: 12, alignItems: 'flex-start', borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Archivo_800ExtraBold', fontSize: 14, color: c.text }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T style={{ fontWeight: '600' }}>{st.title}</T>
                    <T variant="footnote">{st.detail}</T>
                  </View>
                </Row>
              ))}
            </Card>
            <Row gap={Spacing.md} style={{ backgroundColor: c.raised, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'flex-start' }}>
              <Icon name="info" size={18} color={c.text2} />
              <T variant="footnote" style={{ flex: 1 }}>
                The file is read on your phone. Only each workout’s date, activity, minutes and calories are saved to your account.
                Re-import any time; duplicates are skipped.
              </T>
            </Row>
            {lastImported ? (
              <T variant="footnote" color={c.text3} style={{ paddingHorizontal: 4 }}>
                Last import runs to {formatDay(lastImported)} · {fmt(existing.data!.length)} sessions saved
              </T>
            ) : null}
            {busy ? (
              <Card accessibilityLiveRegion="polite">
                <Row gap={Spacing.md}>
                  <ActivityIndicator color={c.accentLine} />
                  <T>Reading the export…</T>
                </Row>
              </Card>
            ) : null}
          </>
        ) : null}

        <ErrorText message={error} />

        {parsed ? (
          <>
            <Row gap={Spacing.md} style={{ minHeight: 64 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="file" size={20} color={c.text2} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }} numberOfLines={1} ellipsizeMode="middle">
                  {fileName}
                </T>
                <T variant="footnote">
                  {parsed.skipped ? `${parsed.skipped} rows without workout data skipped` : 'Ready to import'}
                </T>
              </View>
              <Button title="Change" variant="ghost" size="S" onPress={pick} />
            </Row>
            <Row gap={Spacing.md}>
              <Card style={{ flex: 1, gap: 2 }}>
                <Num size="m">{fmt(parsed.workouts.length)}</Num>
                <T variant="footnote">sessions</T>
              </Card>
              <Card style={{ flex: 1, gap: 2 }}>
                <Num size="xs">
                  {formatDay(dates[0])} –{'\n'}
                  {formatDay(dates[dates.length - 1])}
                </Num>
                <T variant="footnote">date range</T>
              </Card>
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {[parsed.columns.start, parsed.columns.activity, parsed.columns.duration, `${parsed.columns.energy} (${parsed.energyUnit})`]
                .filter(Boolean)
                .map((col) => (
                  <View key={col} style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: c.raised, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: c.text2 }}>{col}</Text>
                  </View>
                ))}
            </Row>
            <RatesCard title="What it learned" rates={preview} />
            <T variant="caption" color={c.text3} style={{ fontWeight: '400', paddingHorizontal: 4 }}>
              Workouts under 10 minutes or without calories are ignored.
            </T>
          </>
        ) : null}

        {!parsed && !done && existingRates.length > 0 ? <RatesCard title="Your burn rates" rates={existingRates} /> : null}
      </Screen>
      <SheetFooter>{footer}</SheetFooter>
    </View>
  );
}

const STEPS = [
  { title: 'Request your data', detail: 'In the WHOOP app: Profile › Settings › Data Export.' },
  { title: 'Save the email’s .zip', detail: 'WHOOP emails a download link. Save the file to Files.' },
  { title: 'Choose it here', detail: 'Pick the .zip, or the workouts.csv inside it.' },
  { title: 'Check and import', detail: 'See what it learned per activity before anything is saved.' },
];

function RatesCard({ title, rates }: { title: string; rates: ReturnType<typeof burnRatesByName> }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.sm }}>
      <Overline>{title}</Overline>
      <Card style={{ gap: 0, paddingVertical: 4, borderRadius: 22 }}>
        {rates.map((r, i) => (
          <Animated.View
            key={r.label}
            entering={FadeInDown.duration(220).delay(Math.min(i, 8) * 40)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.trainingBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="stopwatch" size={18} color={c.training} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontWeight: '600' }} numberOfLines={1}>
                {r.label}
              </T>
              <T variant="footnote" numberOfLines={1}>
                {ACTIVITY_LABELS[r.activity]} · {r.samples} session{r.samples === 1 ? '' : 's'} · usually {r.typicalMin} min
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Num size="xs" color={c.training} style={{ fontFamily: 'Archivo_800ExtraBold' }}>
                {fmt(r.kcalPerMin * 60)} kcal/h
              </Num>
              <T variant="caption" style={{ fontWeight: '400' }}>
                ≈ {fmt(r.kcalPerMin * r.typicalMin)} per session
              </T>
            </View>
          </Animated.View>
        ))}
        {rates.length === 0 ? <T variant="footnote">No workouts of 10 minutes or more with calories.</T> : null}
      </Card>
    </View>
  );
}
