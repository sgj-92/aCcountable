import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, ErrorText, Field, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function SignIn() {
  const c = useTheme();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setInfo('Check your email to confirm your account, then sign in.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: Spacing.xxl * 2, marginBottom: Spacing.xl, gap: Spacing.sm }}>
          <T variant="title" style={{ fontSize: 36 }}>
            a<T variant="title" color={c.primary} style={{ fontSize: 36 }}>C</T>countable
          </T>
          <T variant="muted">Calories that follow your training.</T>
        </View>

        {!isSupabaseConfigured ? (
          <Card>
            <T variant="heading">Supabase isn’t configured</T>
            <T variant="muted">
              Copy .env.example to .env, fill in EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart the dev server.
            </T>
          </Card>
        ) : null}

        <Card style={{ gap: Spacing.md }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { label: 'Sign in', value: 'sign-in' },
              { label: 'Create account', value: 'sign-up' },
            ]}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
          />
          <ErrorText message={error} />
          {info ? <T color={c.success}>{info}</T> : null}
          <Button
            title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email || password.length < 6 || !isSupabaseConfigured}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
