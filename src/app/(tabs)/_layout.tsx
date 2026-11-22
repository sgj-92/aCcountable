import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme, useThemeMode } from '@/hooks/use-theme';

export default function TabsLayout() {
  const c = useTheme();
  const { scheme } = useThemeMode();
  return (
    <NativeTabs
      backgroundColor={c.surface}
      // Before iOS 26 the bar went fully transparent over content; keep its background.
      disableTransparentOnScrollEdge
      blurEffect={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
      tintColor={c.accentText}
      iconColor={{ default: c.text2, selected: c.accentText }}
      labelStyle={{ default: { color: c.text2 }, selected: { color: c.accentText } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'c.circle', selected: 'c.circle.fill' }} md="data_usage" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <NativeTabs.Trigger.Label>Plan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.clipboard" md="checklist" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="week">
        <NativeTabs.Trigger.Label>Week</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
