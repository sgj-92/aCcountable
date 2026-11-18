import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { strFromU8, unzipSync } from 'fflate';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Divider, ErrorText, fmt, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { useTheme } from '@/hooks/use-theme';
import { confirmSession, listUnconfirmedSessions, listWhoopWorkouts, upsertWhoopWorkouts } from '@/lib/api';
import { formatDay } from '@/lib/dates';
import { ACTIVITY_LABELS } from '@/lib/nutrition';
import { burnRates, matchToSessions, parseWhoopWorkouts, type ParsedExport } from '@/lib/whoop';

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
  const existingRates = existing.data
    ? burnRates(
        existing.data.map((w) => ({
          activity: w.activity,
          activityName: w.activity_name,
          durationMin: w.duration_min,
          kcal: w.kcal,
          startedAt: w.started_at,
        })),
      )
    : [];

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

  const preview = parsed ? burnRates(parsed.workouts) : [];
  const dates = parsed ? parsed.workouts.map((w) => w.date).sort() : [];

  return (
    <Screen padTop={false}>
      <Stack.Screen options={{ title: 'WHOOP history' }} />

      <Card style={{ gap: Spacing.sm }}>
        <T variant="heading">Import from WHOOP</T>
        <T variant="muted">
          In the WHOOP app: Profile → Settings → Data Export. WHOOP emails you a .zip. Save it to Files, then pick it
          here (or pick the workouts.csv inside it).
        </T>
        <T variant="small">
          Your sessions are then estimated from your own history, and planned sessions WHOOP recorded are confirmed
          automatically. Re-import any time; duplicates are skipped.
        </T>
        {busy ? (
          <Row style={{ justifyContent: 'center', paddingVertical: Spacing.sm }} gap={Spacing.md}>
            <ActivityIndicator color={c.primary} />
            <T variant="muted">Working…</T>
          </Row>
        ) : (
          <Button title={parsed ? 'Pick a different file' : 'Choose export file'} onPress={pick} variant={parsed ? 'secondary' : 'primary'} />
        )}
      </Card>

      <ErrorText message={error} />

      {done ? (
        <Card>
          <T variant="heading" color={c.success}>
            ✓ Imported {fmt(done.imported)} workouts
          </T>
          <T variant="muted">
            {done.confirmed > 0
              ? `${done.confirmed} planned session${done.confirmed === 1 ? '' : 's'} confirmed with WHOOP’s numbers.`
              : 'No unconfirmed planned sessions matched these workouts.'}
          </T>
        </Card>
      ) : null}

      {parsed ? (
        <>
          <Card style={{ gap: Spacing.xs }}>
            <T variant="heading">{fileName}</T>
            <T variant="muted">
              {fmt(parsed.workouts.length)} workouts · {formatDay(dates[0])} to {formatDay(dates[dates.length - 1])}
              {parsed.skipped ? ` · ${parsed.skipped} rows without workout data skipped` : ''}
            </T>
            <T variant="small">
              Read from: “{parsed.columns.start}”, “{parsed.columns.activity ?? '—'}”, “{parsed.columns.duration}”, “
              {parsed.columns.energy}” ({parsed.energyUnit})
            </T>
          </Card>
          <RatesCard title="What it learned" rates={preview} />
          <Button title={`Import ${fmt(parsed.workouts.length)} workouts`} onPress={importNow} loading={busy} />
        </>
      ) : null}

      {!parsed && existingRates.length > 0 ? <RatesCard title="Your burn rates" rates={existingRates} /> : null}
    </Screen>
  );
}

function RatesCard({ title, rates }: { title: string; rates: ReturnType<typeof burnRates> }) {
  return (
    <Card style={{ gap: 0 }}>
      <T variant="heading" style={{ marginBottom: Spacing.xs }}>
        {title}
      </T>
      {rates.map((r, i) => (
        <View key={r.activity}>
          {i > 0 ? <Divider /> : null}
          <Row style={{ justifyContent: 'space-between', paddingVertical: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <T>{r.label}</T>
              <T variant="small">
                {ACTIVITY_LABELS[r.activity]} · {r.samples} session{r.samples === 1 ? '' : 's'} · usually {r.typicalMin} min
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T>{fmt(r.kcalPerMin * 60)} kcal/h</T>
              <T variant="small">≈ {fmt(r.kcalPerMin * r.typicalMin)} per session</T>
            </View>
          </Row>
        </View>
      ))}
      {rates.length === 0 ? <T variant="small">No workouts of 10 minutes or more with calories.</T> : null}
    </Card>
  );
}
