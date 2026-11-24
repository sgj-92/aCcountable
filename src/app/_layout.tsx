import { Archivo_700Bold, Archivo_800ExtraBold, useFonts } from '@expo-google-fonts/archivo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import '@/lib/web-alert';
import { MenuHost } from '@/components/menu';
import { SheetClose } from '@/components/sheet';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { ProfileProvider } from '@/hooks/use-profile';
import { AppThemeProvider, useTheme, useThemeMode } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

/** Sheets: page-sheet modal, ✕ on the left, centred title. */
const sheet = {
  presentation: 'modal',
  headerLeft: () => <SheetClose />,
  // In a wide browser window, a readable column rather than edge to edge.
  ...(Platform.OS === 'web' ? { contentStyle: { width: '100%', maxWidth: 720, alignSelf: 'center' as const } } : null),
} as const;

function RootNavigator() {
  const { session, initialising } = useAuth();
  // Numbers use Archivo. If the font fails to load the system font is used instead.
  const [fontsLoaded, fontError] = useFonts({ Archivo_700Bold, Archivo_800ExtraBold });
  const ready = !initialising && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back', headerShadowVisible: false, headerTitleAlign: 'center' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ ...sheet, title: 'Scan a meal' }} />
        <Stack.Screen name="food" options={{ ...sheet, title: 'Food' }} />
        <Stack.Screen name="training" options={{ ...sheet, title: 'Training session' }} />
        <Stack.Screen name="plan-item" options={{ ...sheet, title: 'Planned food' }} />
        <Stack.Screen name="weigh-in" options={{ ...sheet, title: 'Weight' }} />
        <Stack.Screen name="whoop-import" options={{ ...sheet, title: 'WHOOP history' }} />
        <Stack.Screen name="log-day" options={{ ...sheet, title: 'Log your day' }} />
        <Stack.Screen name="pantry" options={{ ...sheet, title: 'Pantry' }} />
        <Stack.Screen name="pantry-item" options={{ ...sheet, title: 'Pantry food' }} />
        <Stack.Screen name="day-types" options={{ ...sheet, title: 'Day types' }} />
        <Stack.Screen name="day-type" options={{ ...sheet, title: 'Day type' }} />
        <Stack.Screen name="meal-time" options={{ ...sheet, title: 'Meal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

/** Navigation chrome (headers, modal backgrounds) in the app's palette. */
function ThemedNavigation() {
  const { scheme } = useThemeMode();
  const c = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accentText,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.line,
      notification: c.alert,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <ProfileProvider>
          <RootNavigator />
          <MenuHost />
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <ThemedNavigation />
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}
