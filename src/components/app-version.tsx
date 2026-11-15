import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const fmtDate = (d: Date) =>
  `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;

/**
 * Shows which code is running (the TestFlight build itself, or an
 * over-the-air update on top of it) and lets you pull the latest update now
 * instead of waiting for the next app launch.
 */
export function AppVersion() {
  const c = useTheme();
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? '?';

  const running = !Updates.isEnabled
    ? 'Development build'
    : Updates.isEmbeddedLaunch || !Updates.createdAt
      ? 'Built-in version (from TestFlight)'
      : `Update from ${fmtDate(Updates.createdAt)}`;

  async function check() {
    setBusy(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'You have the latest version.');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Update ready', 'Restarting to apply it.', [{ text: 'OK', onPress: () => Updates.reloadAsync() }]);
    } catch (e) {
      Alert.alert('Couldn’t check for updates', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: Spacing.sm }}>
      <T variant="heading">App version</T>
      <T variant="muted">
        aCcountable {version} · {running}
      </T>
      {Updates.isEnabled && Updates.updateId ? (
        <T variant="small" color={c.textMuted}>
          Update {Updates.updateId.slice(0, 8)} · channel {Updates.channel ?? 'none'}
        </T>
      ) : null}
      {Updates.isEnabled ? (
        <Button title="Check for updates" variant="secondary" onPress={check} loading={busy} />
      ) : null}
    </Card>
  );
}
