import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand-mark';
import { Icon } from '@/components/icon';
import { useKeyboardHeight } from '@/components/sheet';
import { Button, Card, Field, Row, Screen, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Plain-words versions of the auth errors people actually hit. */
function friendly(message: string, mode: Mode): { text: string; flip?: boolean } {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return { text: 'Wrong email or password.' };
  if (m.includes('already registered') || m.includes('already exists'))
    return { text: 'That email already has an account.', flip: mode === 'sign-up' };
  if (m.includes('email not confirmed')) return { text: 'Confirm your email first: check your inbox for the link.' };
  return { text: message };
}

export default function SignIn() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; flip?: boolean } | null>(null);
  const [sent, setSent] = useState<'confirm' | 'reset' | null>(null);

  const minPassword = mode === 'sign-up' ? 8 : 6;
  const emailOk = EMAIL.test(email.trim());
  const canSubmit = emailOk && password.length >= minPassword && isSupabaseConfigured;

  function fail(e: unknown) {
    setError(friendly(e instanceof Error ? e.message : String(e), mode));
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setSent('confirm');
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    if (!emailOk) {
      setError({ text: 'Enter your email above first.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
      setSent('reset');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <CheckEmail email={email.trim()} kind={sent} onBack={() => setSent(null)} bottom={insets.bottom} />;

  const compact = keyboard > 0;

  return (
    <Screen>
      <View style={{ paddingHorizontal: Spacing.sm, gap: Spacing.lg }}>
        {compact ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md }}>
            <BrandMark size={36} />
            <Wordmark size={24} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: Spacing.huge, gap: Spacing.md }}>
            <BrandMark size={76} />
            <Wordmark size={40} />
            <T color={c.text2} style={{ fontSize: 16, lineHeight: 22 }}>
              Calories that follow your training.
            </T>
          </Animated.View>
        )}

        {!isSupabaseConfigured ? (
          <Card>
            <T variant="headline">Supabase isn’t configured</T>
            <T variant="footnote">
              Copy .env.example to .env, fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart the
              dev server.
            </T>
          </Card>
        ) : null}

        <Segmented
          height={44}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { label: 'Sign in', value: 'sign-in' },
            { label: 'Create account', value: 'sign-up' },
          ]}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          invalid={!!error && error.text.startsWith('Wrong')}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          secureTextEntry
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
          returnKeyType="go"
          onSubmitEditing={submit}
          hint={mode === 'sign-up' ? 'At least 8 characters.' : undefined}
          invalid={!!error && error.text.startsWith('Wrong')}
        />
        {error ? (
          <Animated.View entering={FadeIn.duration(160)} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <Icon name="alert" size={16} color={c.alert} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.alert }}>
              {error.text}
              {error.flip ? (
                <Text
                  style={{ fontWeight: '700', color: c.accentText }}
                  onPress={() => {
                    setMode('sign-in');
                    setError(null);
                  }}>
                  {' '}
                  Sign in instead?
                </Text>
              ) : null}
            </Text>
          </Animated.View>
        ) : null}
        <Button
          title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
          size="L"
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
        />
        {mode === 'sign-in' ? (
          <Button title="Forgot password?" variant="ghost" onPress={forgot} style={{ alignSelf: 'center' }} />
        ) : null}
      </View>
    </Screen>
  );
}

function Wordmark({ size }: { size: number }) {
  const c = useTheme();
  const style = { fontFamily: 'Archivo_800ExtraBold', fontSize: size, lineHeight: size * 1.1, letterSpacing: -size * 0.03, color: c.text };
  return (
    <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={style}>
      a<Text style={{ color: c.accentText }}>C</Text>countable
    </Text>
  );
}

function CheckEmail({ email, kind, onBack, bottom }: { email: string; kind: 'confirm' | 'reset'; onBack: () => void; bottom: number }) {
  const c = useTheme();
  const [canMail, setCanMail] = useState(false);
  const [wait, setWait] = useState(60);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    Linking.canOpenURL('message://').then(setCanMail, () => setCanMail(false));
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function resend() {
    setNote(null);
    const { error } =
      kind === 'confirm'
        ? await supabase.auth.resend({ type: 'signup', email })
        : await supabase.auth.resetPasswordForEmail(email);
    setNote(error ? error.message : 'Sent again.');
    setWait(60);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: Spacing.xxl, paddingBottom: bottom + 48, justifyContent: 'space-between' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.lg }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={44} color={c.good} strokeWidth={2.6} />
        </View>
        <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', color: c.text, textAlign: 'center' }}>Check your email</Text>
        <T color={c.text2} style={{ fontSize: 16, lineHeight: 22, textAlign: 'center' }}>
          {kind === 'confirm'
            ? `We sent a link to ${email}. Open it on this phone to confirm your account and you’ll be signed in.`
            : `We sent a password reset link to ${email}.`}
        </T>
        {note ? <T variant="footnote">{note}</T> : null}
      </View>
      <View style={{ gap: Spacing.sm }}>
        {canMail ? <Button title="Open Mail" size="L" onPress={() => Linking.openURL('message://')} /> : null}
        <Button
          title={wait > 0 ? `Resend in ${wait}s` : 'Resend'}
          variant="ghost"
          disabled={wait > 0}
          onPress={resend}
        />
        <Row style={{ justifyContent: 'center' }}>
          <Button title="Back to sign in" variant="ghost" onPress={onBack} />
        </Row>
      </View>
    </View>
  );
}
