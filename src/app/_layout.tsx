import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/hooks/use-auth';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initialising } = useAuth();

  useEffect(() => {
    if (!initialising) SplashScreen.hideAsync();
  }, [initialising]);

  if (initialising) return null;

  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Scan a meal' }} />
        <Stack.Screen name="food" options={{ presentation: 'modal', title: 'Food' }} />
        <Stack.Screen name="training" options={{ presentation: 'modal', title: 'Training session' }} />
        <Stack.Screen name="plan-item" options={{ presentation: 'modal', title: 'Planned food' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
