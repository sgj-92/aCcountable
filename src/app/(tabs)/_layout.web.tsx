import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/**
 * The web version of the tabs (native tabs are iOS/Android only): a bottom bar in a
 * narrow window, a sidebar on a laptop-sized one.
 */
export default function TabsLayout() {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: unknown }) {
      return <Icon name={name} size={22} color={String(color)} strokeWidth={2} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: c.accentText,
        tabBarInactiveTintColor: c.text2,
        tabBarActiveBackgroundColor: wide ? c.accentBg : undefined,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderColor: c.line,
          ...(wide ? { width: 220, paddingTop: 24, paddingHorizontal: 8 } : {}),
        },
        tabBarItemStyle: wide ? { borderRadius: 12, marginVertical: 2 } : undefined,
        tabBarLabelStyle: { fontSize: wide ? 15 : 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('ring') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
