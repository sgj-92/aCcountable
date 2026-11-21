import { Archivo_700Bold, Archivo_800ExtraBold, useFonts } from '@expo-google-fonts/archivo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { ProfileProvider } from '@/hooks/use-profile';
import { AppThemeProvider, useTheme, useThemeMode } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

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
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Scan a meal' }} />
        <Stack.Screen name="food" options={{ presentation: 'modal', title: 'Food' }} />
        <Stack.Screen name="training" options={{ presentation: 'modal', title: 'Training session' }} />
        <Stack.Screen name="plan-item" options={{ presentation: 'modal', title: 'Planned food' }} />
        <Stack.Screen name="weigh-in" options={{ presentation: 'modal', title: 'Weight' }} />
        <Stack.Screen name="whoop-import" options={{ presentation: 'modal', title: 'WHOOP history' }} />
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
